import datetime as dt
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from review_store import connect, submit, review, export_public
from refresh_tfl import refresh
from import_changing_places import prepare

class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.db=connect(self.root/'review.sqlite')
        self.db.execute('INSERT INTO places VALUES (?,?)',('test:place','Test place'));self.db.commit()
        self.record={'place_id':'test:place','attribute':'entrance_step_free','value':'yes','scope':'main entrance only','observed_at':'2020-01-01','evidence_url':'https://example.org/test-evidence','notes':'Synthetic test fixture, never delivered as a real observation.','contributor_id':'test-contributor'}
    def tearDown(self):self.db.close();self.tmp.cleanup()
    def test_moderation_and_revocation(self):
        oid=submit(self.db,self.record)
        self.assertEqual(export_public(self.db,self.root/'public.json'),[])
        with self.assertRaises(sqlite3.IntegrityError):review(self.db,oid,'test-contributor','approved','self review')
        review(self.db,oid,'test-reviewer','approved','Checked test evidence')
        self.assertEqual(len(export_public(self.db,self.root/'public.json')),1)
        review(self.db,oid,'test-reviewer','needs_changes','Evidence needs correction')
        self.assertEqual(export_public(self.db,self.root/'public.json'),[])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM observation_reviews').fetchone()[0],2)
    def test_invalid_date_evidence_and_place(self):
        tomorrow=(dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=2)).isoformat()
        for patch_data in [{'observed_at':tomorrow},{'evidence_url':''},{'observed_at':'2020-01-01T10:00:00'}]:
            with self.assertRaises(ValueError):submit(self.db,{**self.record,**patch_data})
        for patch_data in [{'place_id':'missing'},{'attribute':'officially_registered_changing_place'},{'value':'probably'}]:
            with self.assertRaises(sqlite3.IntegrityError):submit(self.db,{**self.record,**patch_data})
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM observations').fetchone()[0],0)
    def test_source_claim_separation_and_immutability(self):
        self.db.execute('INSERT INTO source_claims VALUES (?,?,?,?)',('claim','2020-01-01','test:place','{"wheelchair":"no"}'));self.db.commit()
        oid=submit(self.db,self.record);review(self.db,oid,'test-reviewer','approved','Checked')
        self.assertIn('"no"',self.db.execute('SELECT payload_json FROM source_claims').fetchone()[0])
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE source_claims SET payload_json=?',('{}',))
        with self.assertRaises(sqlite3.IntegrityError):self.db.execute('DELETE FROM observation_reviews')
    def test_contradictory_observations_are_not_flattened(self):
        for value in ['yes','no']:
            oid=submit(self.db,{**self.record,'value':value});review(self.db,oid,'test-reviewer','approved','Checked distinct scopes/dates')
        records=export_public(self.db,self.root/'public.json')
        self.assertEqual({r['value'] for r in records},{'yes','no'})

class UpdateTests(unittest.TestCase):
    def test_failed_download_preserves_existing_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);output=root/'repo';output.mkdir();sentinel=output/'existing.json';sentinel.write_text('{"keep":true}')
            with patch('refresh_tfl.download',side_effect=RuntimeError('Test download failure')):
                with self.assertRaises(RuntimeError):refresh(output,root/'cache',root/'boundaries.geojson','full')
            self.assertEqual(sentinel.read_text(),'{"keep":true}')
            self.assertEqual(len(list(output.rglob('*'))),1)
    def test_registry_permission_gate(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);rights=root/'rights.json'
            rights.write_text(json.dumps({k:'test' for k in ['source_url','permission_reference','attribution','permission_checked_at','source_retrieved_at']}))
            with self.assertRaises(ValueError):prepare(root/'not-downloaded.csv',rights,root/'candidates.csv',root/'boundaries.geojson',root/'output')
            self.assertFalse((root/'output').exists())

if __name__=='__main__':unittest.main()
