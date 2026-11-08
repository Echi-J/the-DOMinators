"""Regression checks for source nulls and incomplete opening-time records."""
import unittest
from clean_toiletmap import flag, opening_hours, distance


class SourceSemantics(unittest.TestCase):
    def test_null_and_unexpected_values_do_not_become_no(self):
        self.assertEqual(flag(None), 'unknown')
        self.assertEqual(flag('false'), 'unknown')
        self.assertEqual(flag(0), 'unknown')
        self.assertEqual(flag(False), 'no')
        self.assertEqual(flag(True), 'yes')

    def test_missing_daily_hours_are_not_closed(self):
        week = [['09:00', '17:00']] * 5 + [[], []]
        self.assertEqual(opening_hours(week)[5:], [None, None])
        self.assertIsNone(opening_hours(None))
        self.assertIsNone(opening_hours([['25:00', '17:00']] * 7))
        self.assertIsNone(opening_hours([['09:00', '17:00']]))

    def test_nearby_does_not_mean_same_coordinates(self):
        self.assertEqual(distance([0, 0], [0, 0]), 0)
        self.assertGreater(distance([-.1, 51.5], [-.1, 51.5002]), 20)


if __name__ == '__main__':
    unittest.main()
