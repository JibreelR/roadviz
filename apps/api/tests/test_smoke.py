import unittest

from app.main import app, healthcheck, read_root


class SmokeTests(unittest.TestCase):
    def test_app_metadata(self) -> None:
        self.assertEqual(app.title, "RoadViz API")
        self.assertEqual(app.version, "0.1.0")

    def test_root_payload(self) -> None:
        self.assertEqual(
            read_root(),
            {
                "name": "RoadViz API",
                "status": "scaffolded",
            },
        )

    def test_health_payload(self) -> None:
        self.assertEqual(healthcheck(), {"status": "ok"})

    def test_routes_exist(self) -> None:
        paths = {route.path for route in app.routes}
        self.assertIn("/", paths)
        self.assertIn("/health", paths)


if __name__ == "__main__":
    unittest.main()
