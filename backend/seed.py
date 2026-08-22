"""Seed the Dayflow database with realistic demo data.

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
    ("E-1001", "Priya Sharma", "priya@dayflow.com", "hr", "People Ops", "HR Manager",
     "2021-06-14", "+91 98400 11223", "12 Anna Nagar, Chennai",
     dict(basic=45000, hra=18000, transport=3200, special=9500, pf=5400, pt=200, insurance=1500)),
    ("E-1002", "Arjun Mehta", "arjun@dayflow.com", "employee", "Engineering", "Software Engineer",
     "2023-02-01", "+91 99020 44556", "44 MG Road, Bengaluru",
     dict(basic=38000, hra=15200, transport=2400, special=7000, pf=4560, pt=200, insurance=1250)),
    ("E-1003", "Sneha Iyer", "sneha@dayflow.com", "employee", "Engineering", "QA Engineer",
     "2023-08-21", "+91 98410 77889", "8 T Nagar, Chennai",
     dict(basic=32000, hra=12800, transport=2400, special=5200, pf=3840, pt=200, insurance=1250)),
    ("E-1004", "Rahul Verma", "rahul@dayflow.com", "employee", "Sales", "Sales Executive",
     "2022-11-07", "+91 90030 12345", "21 Jubilee Hills, Hyderabad",
     dict(basic=28000, hra=11200, transport=2400, special=4500, pf=3360, pt=200, insurance=1250)),
    ("E-1005", "Divya Nair", "divya@dayflow.com", "employee", "Finance", "Accountant",
     "2022-04-19", "+91 97440 33445", "5 Kaloor, Kochi",
     dict(basic=30000, hra=12000, transport=2400, special=5000, pf=3600, pt=200, insurance=1250)),
    ("E-1006", "Karthik Raj", "karthik@dayflow.com", "employee", "Engineering", "Frontend Developer",
     "2024-01-08", "+91 96550 66778", "17 K K Nagar, Chennai",
     dict(basic=36000, hra=14400, transport=2400, special=6200, pf=4320, pt=200, insurance=1250)),
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
        if roll < 0.80:
            rec = dict(status="present", check_in=_rand_time(rng, 8, 9, 45, 59), check_out=_rand_time(rng, 17, 18, 40, 59))
        elif roll < 0.87:
            rec = dict(status="half-day", check_in=_rand_time(rng, 8, 9, 45, 59), check_out=_rand_time(rng, 13, 14, 0, 30))
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

        # attendance history — deterministic per employee (same rule as the frontend mock)
        rng = random.Random(f"{emp_id}-seed")
        for offset in range(35, 0, -1):
            day = today - timedelta(days=offset)
            if day.weekday() == 6:
                db.session.add(Attendance(employee_id=emp_id, date=day, status="weekoff"))
                continue
            roll = rng.random()
            if roll < 0.80:
                rec = dict(status="present", check_in=_rand_time(rng, 8, 9, 45, 59), check_out=_rand_time(rng, 17, 18, 40, 59))
            elif roll < 0.87:
                rec = dict(status="half-day", check_in=_rand_time(rng, 8, 9, 45, 59), check_out=_rand_time(rng, 13, 14, 0, 30))
            elif roll < 0.94:
                rec = dict(status="absent", check_in=None, check_out=None)
            else:
                rec = dict(status="leave", check_in=None, check_out=None)
            db.session.add(Attendance(employee_id=emp_id, date=day, **rec))

        # today: everyone checked in EXCEPT the demo employee (E-1002) so the
        # check-in button can be demonstrated live (same as the frontend mock)
        today_status = "not-marked" if emp_id == "E-1002" else "present"
        today_in = None if emp_id == "E-1002" else _rand_time(rng, 8, 9, 40, 59)
        db.session.add(Attendance(employee_id=emp_id, date=today, status=today_status, check_in=today_in))

        db.session.flush()
        sync_employee_payslips(emp)

    # leave requests (mirrors the frontend mock, relative to today)
    demo_leaves = [
        ("E-1002", "sick", 2, 3, "Fever, doctor advised rest.", "pending", None, 5),
        ("E-1005", "paid", 7, 9, "Family function at hometown.", "pending", None, 26),
        ("E-1003", "paid", -6, -6, "Personal work.", "approved", "Approved. Enjoy!", 8 * 24),
        ("E-1004", "unpaid", -12, -11, "Personal trip.", "rejected", "Busy quarter — please re-plan.", 14 * 24),
        ("E-1006", "sick", 5, 5, "Doctor consultation.", "approved", "Get well soon.", 2 * 24),
        ("E-1002", "paid", -20, -19, "Family event.", "approved", None, 24 * 24),
    ]
    from datetime import datetime, timedelta as td
    for idx, (emp_id, ltype, d1, d2, remarks, status, comment, hours_ago) in enumerate(demo_leaves, start=2001):
        f, t = today + timedelta(days=d1), today + timedelta(days=d2)
        db.session.add(Leave(
            id=f"L-{idx}", employee_id=emp_id, type=ltype, from_date=f, to_date=t,
            days=working_days_between(f, t), remarks=remarks, status=status, hr_comment=comment,
            created_at=datetime.now() - td(hours=hours_ago),
            decided_at=datetime.now() - td(hours=hours_ago - 2) if status != "pending" else None,
        ))

    # activity feed
    activities = [
        ("plane", "<b>Arjun Mehta</b> applied for Sick Leave (2 days).", 2),
        ("wallet", "July payroll was processed for all employees.", 6),
        ("plane", "<b>Divya Nair</b> applied for Paid Leave (3 days).", 26),
        ("check", "<b>Priya Sharma</b> approved Sick Leave for <b>Karthik Raj</b>.", 48),
        ("calCheck", "<b>Sneha Iyer</b> completed 12 consecutive working days.", 72),
        ("user", "New employee <b>Karthik Raj</b> onboarded to Engineering.", 120),
    ]
    for icon, text, hours_ago in activities:
        db.session.add(Activity(icon=icon, text=text, created_at=datetime.now() - td(hours=hours_ago)))

    db.session.commit()

    if verbose:
        print("✔ Seeded demo data:")
        print(f"  HR/Admin  → priya@dayflow.com / {DEMO_PASSWORD}")
        print(f"  Employee  → arjun@dayflow.com / {DEMO_PASSWORD}")
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
