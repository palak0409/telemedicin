"""
FastAPI entry point.

REST endpoints live under /api, WebSockets under /ws:
    /ws/notifications             real-time notification push
    /ws/consultations/{room_id}   WebRTC signaling for one consultation
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

import app.database.models  # noqa: F401  registers every model with SQLAlchemy
from app.core.config import settings
from app.database.session import engine
from app.features.admin.router import router as admin_router
from app.features.appointments.router import router as appointments_router
from app.features.auth.router import router as auth_router
from app.features.consultations.router import router as consultations_router
from app.features.consultations.signaling import ws_router as signaling_ws_router
from app.features.doctors.router import router as doctors_router
from app.features.doctors.router import specializations_router
from app.features.documentation.router import router as documentation_router
from app.features.notifications.hub import hub
from app.features.notifications.router import router as notifications_router
from app.features.notifications.router import ws_router as notifications_ws_router
from app.features.patients.router import router as patients_router
from app.features.users.router import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Lets synchronous route handlers (running in worker threads) schedule socket pushes.
    hub.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title=f"{settings.app_name} API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

for router in (
    auth_router,
    users_router,
    specializations_router,
    doctors_router,
    patients_router,
    appointments_router,
    consultations_router,
    documentation_router,
    notifications_router,
    admin_router,
):
    app.include_router(router, prefix="/api")

app.include_router(notifications_ws_router)
app.include_router(signaling_ws_router)

settings.upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/api/health", tags=["health"])
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(503, "Database unavailable")
    return {"status": "ok"}
