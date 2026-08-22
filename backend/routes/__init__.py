"""Blueprint registration — one blueprint per API area."""


def register_blueprints(app):
    from routes.activities import activities_bp
    from routes.attendance import attendance_bp
    from routes.auth import auth_bp
    from routes.employees import employees_bp
    from routes.hr import hr_bp
    from routes.leaves import leaves_bp
    from routes.payroll import payroll_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(employees_bp)
    app.register_blueprint(attendance_bp)
    app.register_blueprint(leaves_bp)
    app.register_blueprint(payroll_bp)
    app.register_blueprint(hr_bp)
    app.register_blueprint(activities_bp)
