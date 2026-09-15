import json
import tempfile
import unittest
from pathlib import Path
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from layout_preferences import LayoutStore, install_layout_routes, validate_patch


class StoreTests(unittest.TestCase):
    def test_isolation_restart_merge_and_temporary_piles(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "layout.sqlite3"
            a = LayoutStore(path)
            self.assertEqual(a.access(1)["panels"], {})
            a.access(1, {"left": 25, "right": 17})
            a.access(2, {"left": 14})
            a.access(1, {"log": 5})
            self.assertEqual(LayoutStore(path).access(1)["panels"], {"left": 25, "right": 17, "log": 5})
            self.assertEqual(a.access(2)["panels"], {"left": 14})
            for bad in ({"piles": 60}, {"pileRows": 60}, {"userId": 2}, {"left": True}, {"left": float('nan')}, [], None):
                with self.assertRaises(ValueError):
                    validate_patch(bad)
            self.assertEqual(validate_patch({"left": 999, "log": -1}), {"left": 32, "log": 0})


class FakeOnline:
    def require_user(self, request):
        if request.headers.get('Authorization') not in ('Token one', 'Token two', 'Token deleted'):
            raise web.HTTPUnauthorized()
        return {'Token one': 1, 'Token two': 2, 'Token deleted': 3}[request.headers['Authorization']]

    async def sql(self, query, **params):
        assert query.startswith('SELECT 1 FROM users')
        return '1' if params['user_id'] in ('1', '2') else ''


class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        app = web.Application()
        install_layout_routes(app, FakeOnline(), Path(self.temp.name) / 'prefs.sqlite3')
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        self.temp.cleanup()

    async def test_authenticated_account_routes(self):
        url = '/api/v1/account/tabletop-layout'
        for token in ('', 'Token fake', 'Token deleted'):
            response = await self.client.get(url, headers={'Authorization': token})
            self.assertEqual(response.status, 401)
        one = {'Authorization': 'Token one'}
        two = {'Authorization': 'Token two'}
        response = await self.client.put(url, headers=one, json={'left': 26, 'hand': 60})
        self.assertEqual(response.status, 200)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual((await (await self.client.get(url, headers=two)).json())['panels'], {})
        self.assertEqual((await (await self.client.get(url, headers=one)).json())['panels']['left'], 26)
        for body in ({'piles': 50}, {'pileRows': 50}, {'user_id': 2}, {'left': '26'}, [26]):
            self.assertEqual((await self.client.put(url, headers=one, json=body)).status, 400)
        self.assertEqual((await self.client.put(url, headers=one, data='x' * 8200)).status, 413)


if __name__ == '__main__':
    unittest.main()
