"""Tests for scripts/vendor.py. Run: python3 -m unittest scripts/test_vendor.py"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vendor  # noqa: E402


class RewriteTest(unittest.TestCase):
    TARGETS = {"vue": "vue/vue.js", "@floating-ui/dom": "floating-ui/dom.js"}

    def test_rewrites_static_dynamic_and_side_effect_imports(self):
        src = 'import{h}from"vue";import"vue";import("@floating-ui/dom");export*from"vue"'
        out = vendor.rewrite(src, "markstream-vue/utils/a.js", self.TARGETS)
        self.assertEqual(
            out,
            'import{h}from"../../vue/vue.js";import"../../vue/vue.js";'
            'import("../../floating-ui/dom.js");export*from"../../vue/vue.js"',
        )

    def test_keeps_relative_and_optional_imports(self):
        src = 'import"./x.js";import("katex");f("vue")'
        self.assertEqual(vendor.rewrite(src, "m/a.js", self.TARGETS), src)

    def test_ignores_from_calls(self):
        src = 'Array.from("vue");x.from("vue")'
        self.assertEqual(vendor.rewrite(src, "m/a.js", self.TARGETS), src)

    def test_same_dir_target_gets_dot_slash(self):
        out = vendor.rewrite('from"vue"', "vue/other.js", self.TARGETS)
        self.assertEqual(out, 'from"./vue.js"')


class InsideTest(unittest.TestCase):
    def test_inside(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertTrue(vendor.inside(os.path.join(root, "a/b.js"), root))
            self.assertFalse(vendor.inside(os.path.join(root, "../x.js"), root))
            self.assertFalse(vendor.inside("/etc/passwd", root))


class StaticDepsTest(unittest.TestCase):
    def test_static_relative_deps_only(self):
        src = 'import"./a.js";import("./lazy.js");import"vue";export{x}from"../b.js"'
        self.assertEqual(vendor.static_deps(src, "m/u/c.js"), ["m/u/a.js", "m/b.js"])


if __name__ == "__main__":
    unittest.main()
