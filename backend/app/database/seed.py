"""
Seed data: the specialization catalogue, the admin account, and optional demo
users with realistic schedules and history. Every function is idempotent.

All people below are fictional.
"""
import uuid
from datetime import date, time, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dates import clinic_datetime, clinic_today, utcnow
from app.core.security import hash_password
from app.features.appointments.models import Appointment, AppointmentStatus
from app.features.consultations.models import Consultation, ConsultationStatus
from app.features.documentation.models import ConsultationDocumentation, DocumentationStatus
from app.features.doctors.models import AvailabilityRule, DoctorProfile, Specialization, VerificationStatus
from app.features.patients.models import PatientProfile
from app.features.users.models import User, UserRole

SPECIALIZATIONS = [
    ("General Physician", "Primary care for common illnesses, check-ups and referrals."),
    ("Cardiologist", "Heart and blood vessel conditions, including blood pressure and chest pain."),
    ("Dermatologist", "Skin, hair and nail conditions."),
    ("Pediatrician", "Medical care for infants, children and adolescents."),
    ("Psychiatrist", "Assessment and treatment of mental health conditions."),
    ("Orthopedic", "Bones, joints, muscles and sports injuries."),
    ("Gynecologist", "Women's reproductive health and pregnancy care."),
    ("Neurologist", "Brain, spinal cord and nerve disorders, including migraines."),
    ("ENT Specialist", "Ear, nose and throat conditions."),
    ("Ophthalmologist", "Eye health and vision problems."),
    ("Dentist", "Teeth, gums and oral health."),
    ("Gastroenterologist", "Digestive system, stomach and liver conditions."),
    ("Endocrinologist", "Diabetes, thyroid and other hormonal disorders."),
    ("Pulmonologist", "Lungs, breathing and respiratory conditions."),
    ("Urologist", "Urinary tract and male reproductive health."),
]

WEEKDAYS = range(0, 5)
OFFICE_HOURS = [(d, time(9), time(12, 30)) for d in WEEKDAYS] + [(d, time(14), time(17, 30)) for d in WEEKDAYS]
EVENINGS = [(d, time(17), time(21)) for d in WEEKDAYS] + [(5, time(10), time(14))]
ALTERNATE_DAYS = [(d, time(10), time(16)) for d in (0, 2, 4)] + [(d, time(13), time(19)) for d in (1, 3)]
EXTENDED = [(d, time(8), time(20)) for d in range(0, 7)]

DEMO_PATIENT_EMAIL = "patient@example.com"
DEMO_DOCTOR_EMAIL = "sarah.mitchell@example.com"

DEMO_DOCTORS = [
    dict(name="Sarah Mitchell", email=DEMO_DOCTOR_EMAIL, spec="General Physician", sub="Family Medicine",
         quals="MBBS, MD (Family Medicine)", institution="University of Edinburgh Medical School",
         clinic="Riverside Family Clinic", years=12, langs=["English", "Spanish"], fee="40", duration=30,
         schedule=EXTENDED, license="GMC-4418203",
         bio="Family physician focused on preventive care, chronic disease management and same-week "
             "follow-ups. Comfortable coordinating with specialists when further investigation is needed."),
    dict(name="Rajesh Iyer", email="rajesh.iyer@example.com", spec="Cardiologist", sub="Interventional Cardiology",
         quals="MBBS, MD (Medicine), DM (Cardiology)", institution="All India Institute of Medical Sciences",
         clinic="Heartline Cardiac Centre", years=18, langs=["English", "Hindi", "Tamil"], fee="90", duration=30,
         schedule=OFFICE_HOURS, license="MCI-2007-55821",
         bio="Consultant cardiologist with a focus on hypertension, heart failure and post-procedure follow-up."),
    dict(name="Emily Chen", email="emily.chen@example.com", spec="Dermatologist", sub="Medical Dermatology",
         quals="MD, FAAD", institution="University of California, San Francisco",
         clinic="Clearview Skin Clinic", years=9, langs=["English", "Mandarin"], fee="70", duration=20,
         schedule=OFFICE_HOURS, license="CA-A148822",
         bio="Treats acne, eczema, psoriasis and skin infections. Prefers clear photos shared before the call."),
    dict(name="Daniel Okafor", email="daniel.okafor@example.com", spec="Pediatrician", sub=None,
         quals="MBBS, MD (Paediatrics)", institution="University of Lagos College of Medicine",
         clinic="Little Steps Children's Clinic", years=14, langs=["English", "French"], fee="55", duration=30,
         schedule=EVENINGS, license="MDCN-38841",
         bio="Paediatrician for newborns to teenagers: fevers, growth, nutrition, vaccinations and asthma."),
    dict(name="Priya Nair", email="priya.nair@example.com", spec="Psychiatrist", sub="Adult Psychiatry",
         quals="MBBS, MD (Psychiatry)", institution="Kasturba Medical College",
         clinic="Mindwell Health", years=11, langs=["English", "Hindi", "Malayalam"], fee="80", duration=45,
         schedule=ALTERNATE_DAYS, license="KMC-104552",
         bio="Works with anxiety, depression, sleep difficulties and medication reviews in a calm, unhurried setting."),
    dict(name="Lucas Moreau", email="lucas.moreau@example.com", spec="Orthopedic", sub="Sports Medicine",
         quals="MD, MS (Orthopaedics)", institution="Université Paris Cité",
         clinic="Motion Orthopaedic Centre", years=16, langs=["English", "French"], fee="85", duration=30,
         schedule=OFFICE_HOURS, license="RPPS-10003458821",
         bio="Sports injuries, joint pain and post-operative rehabilitation planning."),
    dict(name="Fatima Haddad", email="fatima.haddad@example.com", spec="Gynecologist", sub="Obstetrics",
         quals="MBBS, MS (Obstetrics & Gynaecology)", institution="American University of Beirut",
         clinic="Cedar Women's Health", years=13, langs=["English", "Arabic", "French"], fee="75", duration=30,
         schedule=ALTERNATE_DAYS, license="LOP-27719",
         bio="Antenatal care, menstrual health, contraception counselling and menopause."),
    dict(name="Michael Brennan", email="michael.brennan@example.com", spec="Neurologist", sub="Headache Medicine",
         quals="MD, DM (Neurology)", institution="Trinity College Dublin",
         clinic="Northside Neurology", years=20, langs=["English"], fee="95", duration=45,
         schedule=OFFICE_HOURS, license="IMC-301284",
         bio="Migraine, epilepsy follow-up, neuropathy and memory concerns."),
    dict(name="Aisha Khan", email="aisha.khan@example.com", spec="ENT Specialist", sub=None,
         quals="MBBS, MS (ENT)", institution="Aga Khan University",
         clinic="Harbour ENT Clinic", years=8, langs=["English", "Hindi", "Urdu"], fee="50", duration=20,
         schedule=EVENINGS, license="PMDC-77120-N",
         bio="Sinusitis, ear infections, hearing concerns and voice problems."),
    dict(name="Kenji Watanabe", email="kenji.watanabe@example.com", spec="Endocrinologist", sub="Diabetes",
         quals="MD, PhD (Endocrinology)", institution="Kyoto University",
         clinic="Sakura Diabetes & Thyroid Centre", years=10, langs=["English", "Japanese"], fee="85", duration=30,
         schedule=OFFICE_HOURS, license="JMA-6602183",
         bio="Type 1 and type 2 diabetes, thyroid disorders and metabolic health."),
]

PENDING_DOCTORS = [
    dict(name="Thomas Weber", email="thomas.weber@example.com", spec="Pulmonologist",
         quals="Dr. med., Facharzt für Innere Medizin und Pneumologie", years=7, license="LAEK-BW-882104"),
    dict(name="Maria Santos", email="maria.santos@example.com", spec="Dentist",
         quals="DDS", years=5, license="CRO-SP-118842"),
]

DEMO_PATIENTS = [
    dict(name="Alex Morgan", email=DEMO_PATIENT_EMAIL, phone="+1 555 0101",
         medical=dict(date_of_birth=date(1990, 4, 12), gender="male", blood_group="O+",
                      allergies="Penicillin (rash)", existing_conditions="Seasonal allergic rhinitis",
                      chronic_conditions="Mild hypertension (diagnosed 2023)",
                      current_medications="Amlodipine 5 mg once daily",
                      previous_surgeries="Appendectomy (2008)",
                      family_history="Father: type 2 diabetes. Mother: hypothyroidism.",
                      emergency_contact_name="Jamie Morgan", emergency_contact_phone="+1 555 0102")),
    dict(name="Jordan Lee", email="jordan.lee@example.com", phone="+1 555 0110",
         medical=dict(date_of_birth=date(1985, 9, 30), gender="female", blood_group="A+",
                      allergies="None known", current_medications="None")),
    dict(name="Maria Gonzalez", email="maria.gonzalez@example.com", phone="+1 555 0120",
         medical=dict(date_of_birth=date(1972, 1, 18), gender="female", blood_group="B+",
                      chronic_conditions="Type 2 diabetes", current_medications="Metformin 500 mg twice daily")),
]


def seed_specializations(db: Session) -> None:
    existing = set(db.scalars(select(Specialization.name)).all())
    new = [Specialization(name=n, description=d) for n, d in SPECIALIZATIONS if n not in existing]
    db.add_all(new)
    db.commit()
    if new:
        print(f"  + {len(new)} specializations")


def seed_admin(db: Session) -> None:
    if not settings.admin_email or not settings.admin_password:
        print("  ! ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping admin account.")
        return
    email = settings.admin_email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        return
    db.add(
        User(email=email, password_hash=hash_password(settings.admin_password), role=UserRole.ADMIN,
             full_name=settings.admin_name)
    )
    db.commit()
    print(f"  + admin account {email}")


def _upcoming_weekday(offset_days: int) -> date:
    day = clinic_today() + timedelta(days=offset_days)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


def seed_demo_data(db: Session) -> None:
    if db.scalar(select(User.id).where(User.email == DEMO_PATIENT_EMAIL)):
        return
    if not settings.demo_password:
        print("  ! DEMO_PASSWORD not set; skipping demo users.")
        return

    password_hash = hash_password(settings.demo_password)
    specs = {s.name: s for s in db.scalars(select(Specialization)).all()}
    now = utcnow()

    doctors: dict[str, User] = {}
    for d in DEMO_DOCTORS:
        user = User(
            email=d["email"], password_hash=password_hash, role=UserRole.DOCTOR, full_name=d["name"],
            doctor_profile=DoctorProfile(
                specialization=specs[d["spec"]], sub_specialization=d["sub"], license_number=d["license"],
                qualifications=d["quals"], medical_institution=d["institution"], clinic_affiliation=d["clinic"],
                years_of_practice=d["years"], languages=d["langs"], consultation_fee=Decimal(d["fee"]),
                bio=d["bio"], consultation_duration_minutes=d["duration"],
                verification_status=VerificationStatus.VERIFIED, verified_at=now,
                availability_rules=[AvailabilityRule(day_of_week=w, start_time=s, end_time=e) for w, s, e in d["schedule"]],
            ),
        )
        db.add(user)
        doctors[d["email"]] = user

    for d in PENDING_DOCTORS:
        db.add(User(
            email=d["email"], password_hash=password_hash, role=UserRole.DOCTOR, full_name=d["name"],
            doctor_profile=DoctorProfile(
                specialization=specs[d["spec"]], license_number=d["license"], qualifications=d["quals"],
                years_of_practice=d["years"], languages=["English"], consultation_fee=Decimal("0"),
                verification_status=VerificationStatus.PENDING,
            ),
        ))

    patients: dict[str, User] = {}
    for p in DEMO_PATIENTS:
        user = User(email=p["email"], password_hash=password_hash, role=UserRole.PATIENT, full_name=p["name"],
                    phone=p["phone"], patient_profile=PatientProfile(**p["medical"]))
        db.add(user)
        patients[p["email"]] = user
    db.flush()

    alex, jordan, maria = (patients[p["email"]] for p in DEMO_PATIENTS)
    sarah, rajesh, emily = doctors[DEMO_DOCTOR_EMAIL], doctors["rajesh.iyer@example.com"], doctors["emily.chen@example.com"]

    def appointment(patient, doctor, day, at, minutes, reason, status, notes=None, note=None, documentation=None):
        start = clinic_datetime(day, at)
        requested = min(now, start) - timedelta(days=2)
        appt = Appointment(patient_id=patient.id, doctor_id=doctor.id, start_time=start,
                           end_time=start + timedelta(minutes=minutes), reason=reason, status=status,
                           status_note=note, created_at=requested, updated_at=requested)
        if status == AppointmentStatus.COMPLETED:
            appt.consultation = Consultation(
                room_id=str(uuid.uuid4()), status=ConsultationStatus.ENDED, notes=notes,
                started_at=start + timedelta(minutes=2), ended_at=start + timedelta(minutes=minutes - 6),
                ended_by_id=doctor.id,
                documentation=documentation,
            )
        db.add(appt)

    today = clinic_today()
    appointment(alex, sarah, today - timedelta(days=21), time(10), 30,
                "Blocked nose, sneezing and itchy eyes for about a week.", AppointmentStatus.COMPLETED,
                notes="Seasonal allergic rhinitis. Start cetirizine 10 mg at night for 14 days and saline "
                      "nasal rinse. Return if symptoms persist beyond two weeks or fever develops.",
                documentation=_demo_documentation(sarah.id, now))
    appointment(alex, rajesh, today - timedelta(days=45), time(11), 30,
                "Follow-up on home blood pressure readings around 145/95.", AppointmentStatus.COMPLETED,
                notes="BP averaging 142/92 on home log. Started amlodipine 5 mg daily. Reduce salt intake, "
                      "30 minutes of walking daily. Review readings in 6 weeks.")
    appointment(alex, emily, today - timedelta(days=10), time(9, 20), 20,
                "Itchy rash on forearms.", AppointmentStatus.CANCELLED, note="Rash resolved on its own.")
    appointment(jordan, sarah, today - timedelta(days=30), time(15), 30,
                "Recurring tension headaches in the afternoons.", AppointmentStatus.COMPLETED,
                notes="Likely tension-type headache related to screen time. Advised regular breaks, hydration "
                      "and ibuprofen 400 mg as needed (max 3 days/week).")

    appointment(alex, sarah, _upcoming_weekday(2), time(10), 30,
                "Review of allergy medication and blood pressure readings.", AppointmentStatus.CONFIRMED)
    appointment(alex, emily, _upcoming_weekday(4), time(11), 20,
                "Dry, flaky patches on both elbows for a month.", AppointmentStatus.PENDING)
    appointment(jordan, sarah, _upcoming_weekday(1), time(15, 30), 30,
                "Headaches have returned; would like to discuss next steps.", AppointmentStatus.PENDING)
    appointment(maria, sarah, _upcoming_weekday(3), time(9, 30), 30,
                "Routine diabetes check-in and HbA1c results.", AppointmentStatus.CONFIRMED)

    db.commit()
    print(f"  + demo data: {len(DEMO_DOCTORS) + len(PENDING_DOCTORS)} doctors, {len(DEMO_PATIENTS)} patients")


def _demo_documentation(doctor_id: int, approved_at) -> ConsultationDocumentation:
    """An already-approved AI-assisted record (Hinglish transcript) so the review UI can be explored without API keys."""
    transcript = [
        ("doctor", 2.0, 6.5, "Good morning Alex. Bataiye, kya problem ho rahi hai?"),
        ("patient", 7.0, 15.2, "Doctor, ek hafte se naak band hai, bahut sneezing ho rahi hai aur aankhon mein itching bhi hai."),
        ("doctor", 15.8, 19.0, "Fever ya body ache? Koi khansi?"),
        ("patient", 19.5, 24.0, "Nahi, fever nahi hai. Bas subah subah sneezing zyada hoti hai."),
        ("doctor", 24.5, 29.0, "Any allergies to medicines that you know of?"),
        ("patient", 29.4, 32.0, "Haan, penicillin se rash aaya tha."),
        ("doctor", 32.5, 46.0, "Okay. Yeh seasonal allergic rhinitis lag raha hai. Cetirizine 10 mg raat ko lijiye, chaudah din tak, "
                               "aur saline nasal rinse din mein do baar."),
        ("doctor", 46.5, 53.0, "Agar do hafte mein theek na ho ya fever aaye, toh follow-up appointment book kijiye."),
    ]
    summary = {
        "chief_complaint": "Blocked nose, sneezing and itchy eyes for one week.",
        "symptoms": "- Nasal congestion\n- Sneezing, worse in the mornings\n- Itchy eyes\n- No fever, no cough",
        "medical_history": "",
        "current_medications": "",
        "allergies": "Penicillin (rash).",
        "observations": "",
        "assessment": "Seasonal allergic rhinitis.",
        "plan": "- Cetirizine 10 mg at night for 14 days\n- Saline nasal rinse twice daily",
        "follow_up": "Book a follow-up if not better in two weeks or if fever develops.",
    }
    return ConsultationDocumentation(
        status=DocumentationStatus.APPROVED,
        transcript=[{"speaker": s, "start": a, "end": b, "text": t} for s, a, b, t in transcript],
        detected_languages=["hindi", "english"],
        transcription_model="whisper-large-v3",
        ai_summary=summary,
        summary_model="gemini-2.5-flash",
        draft_summary=summary,
        approved_summary=summary,
        approved_at=approved_at,
        approved_by_id=doctor_id,
    )


def create_demo_call(db: Session) -> None:
    """Creates a confirmed appointment that starts now, so a video call can be tested immediately."""
    patient = db.scalar(select(User).where(User.email == DEMO_PATIENT_EMAIL))
    doctor = db.scalar(select(User).where(User.email == DEMO_DOCTOR_EMAIL))
    if patient is None or doctor is None:
        print("  ! Demo users not found. Set SEED_DEMO_DATA=true and DEMO_PASSWORD, then run again.")
        return

    now = utcnow().replace(second=0, microsecond=0)
    existing = db.scalar(
        select(Appointment).where(
            Appointment.patient_id == patient.id,
            Appointment.doctor_id == doctor.id,
            Appointment.status == AppointmentStatus.CONFIRMED,
            Appointment.end_time > now + timedelta(minutes=10),
            Appointment.start_time <= now + timedelta(minutes=5),
        )
    )
    if existing is None:
        existing = Appointment(
            patient_id=patient.id, doctor_id=doctor.id, start_time=now, end_time=now + timedelta(minutes=30),
            reason="Dry cough for two weeks, worse at night. No fever. (demo call)",
            status=AppointmentStatus.CONFIRMED,
        )
        db.add(existing)
        db.commit()
    print(
        f"  + Demo call ready (appointment #{existing.id}).\n"
        f"    Sign in as {DEMO_PATIENT_EMAIL} in one browser window and {DEMO_DOCTOR_EMAIL} in another,\n"
        f"    then open the appointment and click 'Join consultation'."
    )
