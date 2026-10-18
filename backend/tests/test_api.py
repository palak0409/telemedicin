"""End-to-end API tests: auth, verification, booking rules, access control, notifications."""
from concurrent.futures import ThreadPoolExecutor

from tests.conftest import PASSWORD, first_free_slot


def test_register_login_and_me(client, register):
    headers, user = register("patient", full_name="Ada Patient")
    assert user["role"] == "patient"

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200 and me.json()["email"] == user["email"]

    assert client.post("/api/auth/login", json={"email": user["email"], "password": "wrong-pass"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": user["email"].upper(), "password": PASSWORD}).status_code == 200

    duplicate = client.post(
        "/api/auth/register/patient",
        json={"full_name": "Someone", "email": user["email"], "password": PASSWORD},
    )
    assert duplicate.status_code == 409


def test_protected_routes_require_token_and_role(client, register):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    headers, _ = register("patient")
    assert client.get("/api/admin/stats", headers=headers).status_code == 403


def test_pending_doctor_is_hidden_until_verified(client, register, admin_headers):
    patient_headers, _ = register("patient")
    specialization_id = client.get("/api/specializations").json()[0]["id"]
    doctor_headers, doctor = register(
        "doctor",
        full_name="Pending Person",
        specialization_id=specialization_id,
        license_number="LIC-PENDING-1",
        qualifications="MBBS",
        years_of_practice=3,
    )
    assert doctor["verification_status"] == "pending"

    search = client.get("/api/doctors?q=Pending Person", headers=patient_headers).json()
    assert search["total"] == 0
    assert client.get(f"/api/doctors/{doctor['id']}", headers=patient_headers).status_code == 404

    client.patch(f"/api/admin/doctors/{doctor['id']}/verification", json={"status": "verified"}, headers=admin_headers)
    assert client.get(f"/api/doctors/{doctor['id']}", headers=patient_headers).status_code == 200

    # Rejecting requires a note.
    response = client.patch(
        f"/api/admin/doctors/{doctor['id']}/verification", json={"status": "rejected"}, headers=admin_headers
    )
    assert response.status_code == 422


def test_booking_flow_with_conflicts_and_notifications(client, register, verified_doctor):
    doctor_headers, doctor = verified_doctor
    patient_headers, patient = register("patient")
    other_headers, _ = register("patient")
    slot = first_free_slot(client, doctor["id"], patient_headers)

    booked = client.post(
        "/api/appointments",
        json={"doctor_id": doctor["id"], "start_time": slot, "reason": "Persistent cough"},
        headers=patient_headers,
    )
    assert booked.status_code == 201, booked.text
    appointment = booked.json()
    assert appointment["status"] == "pending"

    # The same slot cannot be requested again, even while pending.
    clash = client.post(
        "/api/appointments",
        json={"doctor_id": doctor["id"], "start_time": slot, "reason": "Another visit"},
        headers=other_headers,
    )
    assert clash.status_code == 409

    # Off-grid start times are rejected.
    off_grid = slot.replace(":00Z", ":07Z") if slot.endswith(":00Z") else slot
    misaligned = client.post(
        "/api/appointments",
        json={"doctor_id": doctor["id"], "start_time": off_grid, "reason": "Odd time"},
        headers=other_headers,
    )
    assert misaligned.status_code in (409, 422)

    notifications = client.get("/api/notifications", headers=doctor_headers).json()
    assert notifications["unread_count"] >= 1
    assert notifications["items"][0]["type"] == "appointment_requested"

    # Only the doctor may accept.
    assert client.post(f"/api/appointments/{appointment['id']}/accept", headers=patient_headers).status_code == 403
    accepted = client.post(f"/api/appointments/{appointment['id']}/accept", headers=doctor_headers)
    assert accepted.json()["status"] == "confirmed"
    assert client.post(f"/api/appointments/{appointment['id']}/accept", headers=doctor_headers).status_code == 409

    patient_notes = client.get("/api/notifications", headers=patient_headers).json()
    assert patient_notes["items"][0]["type"] == "appointment_confirmed"

    upcoming = client.get("/api/appointments?scope=upcoming", headers=patient_headers).json()
    assert [a["id"] for a in upcoming["items"]] == [appointment["id"]]

    detail = client.get(f"/api/appointments/{appointment['id']}", headers=doctor_headers).json()
    assert detail["patient_info"] is not None
    assert client.get(f"/api/appointments/{appointment['id']}", headers=other_headers).status_code == 404

    cancelled = client.post(
        f"/api/appointments/{appointment['id']}/cancel", json={"reason": "Feeling better"}, headers=patient_headers
    )
    assert cancelled.json()["status"] == "cancelled"
    # The slot is free again.
    rebook = client.post(
        "/api/appointments",
        json={"doctor_id": doctor["id"], "start_time": slot, "reason": "Rebooking"},
        headers=other_headers,
    )
    assert rebook.status_code == 201


def test_concurrent_bookings_for_one_slot(client, register, verified_doctor):
    """Row locking must let exactly one of several simultaneous requests win."""
    _, doctor = verified_doctor
    patients = [register("patient")[0] for _ in range(6)]
    slot = first_free_slot(client, doctor["id"], patients[0])

    def book(headers):
        return client.post(
            "/api/appointments",
            json={"doctor_id": doctor["id"], "start_time": slot, "reason": "Concurrent booking"},
            headers=headers,
        ).status_code

    with ThreadPoolExecutor(max_workers=len(patients)) as pool:
        codes = list(pool.map(book, patients))
    assert sorted(codes) == [201] + [409] * (len(patients) - 1)


def test_doctor_patient_access_requires_care_relationship(client, register, verified_doctor):
    doctor_headers, doctor = verified_doctor
    patient_headers, patient = register("patient")
    stranger_headers, stranger = register("patient")

    client.put(
        "/api/patients/me/medical-profile",
        json={"blood_group": "O+", "allergies": "Penicillin", "gender": "female"},
        headers=patient_headers,
    )
    assert client.get(f"/api/patients/{patient['id']}", headers=doctor_headers).status_code == 404

    slot = first_free_slot(client, doctor["id"], patient_headers)
    client.post(
        "/api/appointments",
        json={"doctor_id": doctor["id"], "start_time": slot, "reason": "Check-up visit"},
        headers=patient_headers,
    )
    record = client.get(f"/api/patients/{patient['id']}", headers=doctor_headers)
    assert record.status_code == 200
    assert record.json()["medical"]["allergies"] == "Penicillin"
    assert client.get(f"/api/patients/{stranger['id']}", headers=doctor_headers).status_code == 404
    assert any(p["id"] == patient["id"] for p in client.get("/api/patients", headers=doctor_headers).json())


def test_availability_validation(client, verified_doctor):
    doctor_headers, _ = verified_doctor
    overlapping = client.put(
        "/api/doctors/me/availability",
        json={
            "consultation_duration_minutes": 30,
            "rules": [
                {"day_of_week": 0, "start_time": "09:00", "end_time": "12:00"},
                {"day_of_week": 0, "start_time": "11:00", "end_time": "13:00"},
            ],
        },
        headers=doctor_headers,
    )
    assert overlapping.status_code == 400

    backwards = client.put(
        "/api/doctors/me/availability",
        json={"consultation_duration_minutes": 30, "rules": [{"day_of_week": 0, "start_time": "12:00", "end_time": "09:00"}]},
        headers=doctor_headers,
    )
    assert backwards.status_code == 422
