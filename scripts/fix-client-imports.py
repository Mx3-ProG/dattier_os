"""Detache les imports client des facades serveur.

Chaque facade `src/features/<x>/public.ts` re-exporte des modules serveur.
Un composant « use client » qui en importe une valeur entrainait le serveur
dans le bundle du navigateur. Ce script pointe chaque import vers le module
pur qui definit reellement le symbole.
"""
import os
import re

ROOT = "src"
FEATURES = "src/features"
SERVER_HINT = re.compile(
    r"database/db|node:crypto|next/headers|infrastructure/database"
)


def module_index():
    index = {}
    for feat in sorted(os.listdir(FEATURES)):
        d = os.path.join(FEATURES, feat)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(d, f)
            src = open(path).read()
            pure = "server-only" not in src and not SERVER_HINT.search(src)
            names = set(
                re.findall(
                    r"export\s+(?:const|function|type|class|async function)\s+"
                    r"([A-Za-z_][A-Za-z0-9_]*)",
                    src,
                )
            )
            index.setdefault(feat, []).append((f[:-3], pure, names))
    return index


INDEX = module_index()
# Certains symboles vivent hors de features/ (core/tenant).
CORE_INDEX = {}
for f in sorted(os.listdir("src/core/tenant")):
    if not f.endswith((".ts", ".tsx")):
        continue
    src = open(os.path.join("src/core/tenant", f)).read()
    names = set(
        re.findall(
            r"export\s+(?:const|function|type|class|async function)\s+"
            r"([A-Za-z_][A-Za-z0-9_]*)",
            src,
        )
    )
    CORE_INDEX[f.rsplit(".", 1)[0]] = names

STMT = re.compile(
    r'^(?P<indent>[ \t]*)import\s+(?P<type>type\s+)?\{(?P<names>[^}]*)\}\s+'
    r'from\s+"(?P<feat>@/features/(?P<featname>[a-z-]+)/public)";',
    re.M | re.S,
)


def rewrite(path):
    src = open(path).read()
    client = src.startswith('"use client"')
    pure_module = "server-only" not in src
    if not client and not pure_module:
        return False
    changed = False

    def repl(m):
        nonlocal changed
        if m.group("type"):
            return m.group(0)
        feat = m.group("featname")
        entries = INDEX.get(feat, [])
        parsed = []
        for spec in (n.strip() for n in m.group("names").split(",")):
            if not spec:
                continue
            is_type = spec.startswith("type ")
            name = spec[len("type "):].strip() if is_type else spec
            parts = name.split(" as ")
            base = parts[0].strip()
            alias = parts[1].strip() if len(parts) > 1 else None
            parsed.append((base, alias, is_type))
        groups = {}
        unresolved = []
        for base, alias, is_type in parsed:
            if is_type:
                groups.setdefault(None, []).append((base, alias, is_type))
                continue
            found = None
            for mod, pure, names in entries:
                if mod == "public" or base not in names:
                    continue
                found = (mod, pure)
                break
            if not found:
                for mod, names in CORE_INDEX.items():
                    if base in names:
                        found = (f"@/core/tenant/{mod}", True)
                        break
            if not found:
                unresolved.append(base)
                continue
            if not found:
                unresolved.append(base)
                continue
            mod, pure = found
            groups.setdefault(mod, []).append((base, alias, is_type))
        if unresolved:
            print(f"  ! {path}: symboles non resolus {unresolved}")
            return m.group(0)
        lines = []
        for mod, items in groups.items():
            spec = ", ".join(
                (f"type {b}" if t else b) + (f" as {a}" if a else "")
                for b, a, t in items
            )
            if mod is None:
                lines.append(
                    f'{m.group("indent")}import {{ {spec} }} from "{m.group("feat")}";'
                )
            elif mod.startswith("@/"):
                lines.append(
                    f'{m.group("indent")}import {{ {spec} }} from "{mod}";'
                )
            else:
                lines.append(
                    f'{m.group("indent")}import {{ {spec} }} from "@/features/{feat}/{mod}";'
                )
        changed = True
        return "\n".join(lines)

    out = STMT.sub(repl, src)
    if changed:
        open(path, "w").write(out)
    return changed


count = 0
for dp, _, fns in os.walk(ROOT):
    for fn in fns:
        if fn.endswith((".tsx", ".ts")):
            p = os.path.join(dp, fn)
            if rewrite(p):
                count += 1
print(count, "composants client corriges")
