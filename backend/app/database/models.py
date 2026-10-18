"""
Imports every feature's models so SQLAlchemy can resolve string-based
relationships and `Base.metadata` knows about all tables.
"""
from app.database.base import Base
from app.features.appointments.models import Appointment
from app.features.consultations.models import Consultation
from app.features.documentation.models import ConsultationDocumentation
from app.features.doctors.models import AvailabilityRule, DoctorProfile, Specialization, TimeOff
from app.features.notifications.models import Notification
from app.features.patients.models import PatientProfile
from app.features.users.models import User

__all__ = [
    "Base",
    "User",
    "DoctorProfile",
    "Specialization",
    "AvailabilityRule",
    "TimeOff",
    "PatientProfile",
    "Appointment",
    "Consultation",
    "ConsultationDocumentation",
    "Notification",
]
