import json, re, csv

valid_cols = {}
with open('/tmp/valid_columns.csv', 'r', encoding='utf-8') as f:
    for line in f:
        parts = line.strip().split(',')
        if len(parts) == 3:
            schema, tbl, col = parts
            full_tbl = f"{schema}.{tbl}"
            if full_tbl not in valid_cols:
                valid_cols[full_tbl] = set()
            valid_cols[full_tbl].add(col)

def get_data(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    res = data['result']
    m = re.search(r'<untrusted-data-[^>]+>\n([\s\S]*?)\n</untrusted-data-', res)
    if not m:
        raise ValueError(f'Match failed for {filepath}')
    return json.loads(m.group(1).strip())

auth_users = get_data('/Users/necxa/.gemini/antigravity-ide/brain/8ec934ce-e968-46d1-93f7-c23d8aad7d9b/.system_generated/steps/241/output.txt')[0]['json_agg']
profiles = get_data('/Users/necxa/.gemini/antigravity-ide/brain/8ec934ce-e968-46d1-93f7-c23d8aad7d9b/.system_generated/steps/235/output.txt')[0]['json_agg']
products = get_data('/Users/necxa/.gemini/antigravity-ide/brain/8ec934ce-e968-46d1-93f7-c23d8aad7d9b/.system_generated/steps/244/output.txt')[0]['json_agg']
batch1 = get_data('/Users/necxa/.gemini/antigravity-ide/brain/8ec934ce-e968-46d1-93f7-c23d8aad7d9b/.system_generated/steps/247/output.txt')[0]['json_build_object']
batch2 = get_data('/Users/necxa/.gemini/antigravity-ide/brain/8ec934ce-e968-46d1-93f7-c23d8aad7d9b/.system_generated/steps/250/output.txt')[0]['json_build_object']

sql_statements = [
    "SET session_replication_role = 'replica';",
    "TRUNCATE auth.users, public.profiles, public.products, public.raw_materials, public.product_bom_items, public.production_plans, public.production_plan_items, public.production_orders, public.job_orders, public.plan_materials, public.demolding_records, public.qc_inspections, public.concrete_orders, public.concrete_rounds, public.job_order_defects, public.fg_inventory, public.wip_inventory, public.activity_logs, storage.buckets, storage.objects CASCADE;",
]

def escape_str(s):
    return str(s).replace('"', '\\"')

def format_val(v, col_name=""):
    if v is None:
        return 'NULL'
    if col_name == 'path_tokens':
        if isinstance(v, str) and v.startswith('['):
            try:
                v = json.loads(v)
            except Exception:
                pass
        if isinstance(v, list):
            items_str = ",".join(['"' + escape_str(x) + '"' for x in v])
            return f"'{{{items_str}}}'"
    if isinstance(v, (bool, int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        s = json.dumps(v, ensure_ascii=False).replace("'", "''")
        return f"'{s}'"
    s = str(v).replace("'", "''")
    return f"'{s}'"

def generate_inserts(table_name, rows):
    if not rows:
        return []
    target_cols = valid_cols.get(table_name, set())
    sample_cols = [c for c in rows[0].keys() if c in target_cols]
    col_names = ", ".join([f'"{c}"' for c in sample_cols])
    inserts = []
    for r in rows:
        vals = ", ".join([format_val(r.get(c), c) for c in sample_cols])
        inserts.append(f"INSERT INTO {table_name} ({col_names}) VALUES ({vals});")
    return inserts

sql_statements.extend(generate_inserts('auth.users', auth_users))
sql_statements.extend(generate_inserts('public.profiles', profiles))
sql_statements.extend(generate_inserts('public.products', products))
sql_statements.extend(generate_inserts('public.raw_materials', batch1.get('raw_materials') or []))
sql_statements.extend(generate_inserts('public.product_bom_items', batch1.get('product_bom_items') or []))
sql_statements.extend(generate_inserts('public.production_plans', batch1.get('production_plans') or []))
sql_statements.extend(generate_inserts('public.production_plan_items', batch1.get('production_plan_items') or []))
sql_statements.extend(generate_inserts('public.production_orders', batch1.get('production_orders') or []))
sql_statements.extend(generate_inserts('public.fg_inventory', batch1.get('fg_inventory') or []))
sql_statements.extend(generate_inserts('public.wip_inventory', batch1.get('wip_inventory') or []))

sql_statements.extend(generate_inserts('public.job_orders', batch2.get('job_orders') or []))
sql_statements.extend(generate_inserts('public.plan_materials', batch2.get('plan_materials') or []))
sql_statements.extend(generate_inserts('public.demolding_records', batch2.get('demolding_records') or []))
sql_statements.extend(generate_inserts('public.qc_inspections', batch2.get('qc_inspections') or []))
sql_statements.extend(generate_inserts('public.concrete_orders', batch2.get('concrete_orders') or []))
sql_statements.extend(generate_inserts('public.concrete_rounds', batch2.get('concrete_rounds') or []))
sql_statements.extend(generate_inserts('public.job_order_defects', batch2.get('job_order_defects') or []))
sql_statements.extend(generate_inserts('public.activity_logs', batch2.get('activity_logs') or []))

sql_statements.extend(generate_inserts('storage.buckets', batch2.get('storage_buckets') or []))
sql_statements.extend(generate_inserts('storage.objects', batch2.get('storage_objects') or []))

sql_statements.append("SET session_replication_role = 'origin';")

output_path = '/tmp/live_cloud_full_restore.sql'
with open(output_path, 'w', encoding='utf-8') as f:
    f.write("\n".join(sql_statements))

print(f"Filtered SQL script with {len(sql_statements)} statements saved to {output_path}")
