"""Seed the Axiom database with realistic demo data.

Mirrors the frontend's built-in mock dataset (same people, salaries, leave
requests and activity feed) so the switch mock -> real API is seamless.

Usage:
    python seed.py            # seed only if the database is empty
    python seed.py --reset    # drop everything and reseed
"""
import random
import sys
from datetime import date, timedelta

from extensions import db
from models.activity import Activity, log_activity
from models.attendance import Attendance
from models.employee import Employee
from models.leave import Leave
from models.payroll import sync_employee_payslips
from models.user import User

DEMO_PASSWORD = "password123"

DEMO_EMPLOYEES = [
    # (id, name, email, role, department, position, joinDate, phone, address, salary)
    ("E-1001", "Priya Sharma", "priya@axiom.com", "hr", "People Ops", "HR Manager",
     "2021-06-14", "+91 98400 11223", "12 Anna Nagar, Chennai",
     dict(basic=45000, hra=18000, transport=3200, special=9500, pf=5400, pt=200, insurance=1500)),
    ("E-1002", "Arjun Mehta", "arjun@axiom.com", "employee", "Engineering", "Software Engineer",
     "2023-02-01", "+91 99020 44556", "44 MG Road, Bengaluru",
     dict(basic=38000, hra=15200, transport=2400, special=7000, pf=4560, pt=200, insurance=1250)),

]

DEMO_DOCUMENTS = [
    {"name": "Offer Letter.pdf", "size": "240 KB"},
    {"name": "ID Proof.pdf", "size": "1.1 MB"},
    {"name": "Relieving Letter (Previous).pdf", "size": "310 KB"},
]


def _rand_time(rng, h1, h2, m1=0, m2=59):
    return f"{rng.randint(h1, h2):02d}:{rng.randint(m1, m2):02d}"


def working_days_between(from_date: date, to_date: date) -> int:
    days, d = 0, from_date
    while d <= to_date:
        if d.weekday() != 6:
            days += 1
        d += timedelta(days=1)
    return days


def generate_attendance_history(employee_id: str, days: int = 35) -> None:
    """35 days of plausible history (Sundays off). New signups get this too."""
    rng = random.Random(f"{employee_id}-history")
    today = date.today()
    for offset in range(days, 0, -1):
        day = today - timedelta(days=offset)
        if day.weekday() == 6:
            db.session.add(Attendance(employee_id=employee_id, date=day, status="weekoff"))
            continue
        roll = rng.random()
        mood = None
        if roll < 0.80:
            mood = rng.choice(["🤩", "🙂", "🙂", "😐", "😕", "😫"])
            rec = dict(status="present", check_in=_rand_time(rng, 8, 9, 45, 59), check_out=_rand_time(rng, 17, 18, 40, 59), mood=mood)
        elif roll < 0.87:
            mood = rng.choice(["😐", "😕", "😫"])
            rec = dict(status="half-day", check_in=_rand_time(rng, 8, 9, 45, 59), check_out=_rand_time(rng, 13, 14, 0, 30), mood=mood)
        elif roll < 0.94:
            rec = dict(status="absent", check_in=None, check_out=None)
        else:
            rec = dict(status="leave", check_in=None, check_out=None)
        db.session.add(Attendance(employee_id=employee_id, date=day, **rec))


def seed_demo_data(verbose: bool = True) -> None:
    today = date.today()

    for emp_id, name, email, role, dept, position, join, phone, address, salary in DEMO_EMPLOYEES:
        emp = Employee(
            id=emp_id, name=name, department=dept, position=position,
            join_date=date.fromisoformat(join), phone=phone, address=address,
            photo=None, documents=list(DEMO_DOCUMENTS), **salary,
        )
        db.session.add(emp)
        user = User(email=email, role=role, employee_id=emp_id)
        user.set_password(DEMO_PASSWORD)
        db.session.add(user)



        db.session.flush()
        sync_employee_payslips(emp)


    db.session.commit()

    if verbose:
        print("✔ Seeded demo data:")
        print(f"  HR/Admin  → priya@axiom.com / {DEMO_PASSWORD}")
        print(f"  Employee  → arjun@axiom.com / {DEMO_PASSWORD}")
        print(f"  ({len(DEMO_EMPLOYEES)} employees, attendance history, leaves, payslips, activities)")


def seed_if_empty(verbose: bool = True) -> None:
    if Employee.query.count() == 0:
        seed_demo_data(verbose=verbose)


if __name__ == "__main__":
    from app import create_app

    reset = "--reset" in sys.argv
    application = create_app("development")
    with application.app_context():
        if reset:
            db.drop_all()
            db.create_all()
            print("· Database reset")
        else:
            db.create_all()
        if Employee.query.count() == 0:
            seed_demo_data()
        else:
            print("· Database already contains data (use --reset to reseed)")
