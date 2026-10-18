"""
Database bootstrap: creates the database (when the configured user may), all
tables, and seed data. Safe to run repeatedly.

    python -m app.database.init_db              # schema + seed
    python -m app.database.init_db --demo-call  # also create an appointment you can join now

Tables are created with `metadata.create_all`, which adds missing tables but
never alters existing ones. A production deployment would use Alembic migrations.
"""
import argparse
import re
import sys

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.database import seed
from app.database.models import Base
from app.database.session import SessionLocal, engine


def ensure_database_exists() -> None:
    url = make_url(settings.database_url)
    if not url.database or not re.fullmatch(r"[A-Za-z0-9_]+", url.database):
        sys.exit("DATABASE_URL must include a database name made of letters, digits or underscores.")
    server_engine = create_engine(url.set(database=""))
    try:
        with server_engine.connect() as connection:
            connection.execute(
                text(
                    f"CREATE DATABASE IF NOT EXISTS `{url.database}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            )
    except SQLAlchemyError as exc:
        print(f"  ! Could not create database automatically ({exc.__class__.__name__}); assuming it exists.")
    finally:
        server_engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--demo-call", action="store_true", help="create a confirmed appointment starting now")
    args = parser.parse_args()

    print("Preparing database…")
    ensure_database_exists()
    try:
        Base.metadata.create_all(engine)
    except SQLAlchemyError as exc:
        sys.exit(f"Could not connect to MySQL. Check DATABASE_URL in backend/.env.\n{exc}")

    with SessionLocal() as db:
        seed.seed_specializations(db)
        seed.seed_admin(db)
        if settings.seed_demo_data:
            seed.seed_demo_data(db)
        if args.demo_call:
            seed.create_demo_call(db)
    print("Database ready.")


if __name__ == "__main__":
    main()
