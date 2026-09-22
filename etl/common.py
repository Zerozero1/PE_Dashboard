import time

import psycopg2
import psycopg2.extras

from config import ORIGIN, DW


def connect_origin():
    conn = psycopg2.connect(**ORIGIN, connect_timeout=20)
    conn.set_session(readonly=True, autocommit=True)
    return conn


def connect_dw():
    return psycopg2.connect(**DW, connect_timeout=20)


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def upsert_rows(conn, table, columns, rows, conflict_cols):
    cur = conn.cursor()
    cols = ", ".join(columns)
    sql = (
        f"INSERT INTO {table} ({cols}) VALUES %s "
        f"ON CONFLICT ({', '.join(conflict_cols)}) DO UPDATE SET "
        + ", ".join(f"{c} = EXCLUDED.{c}" for c in columns if c not in conflict_cols)
    )
    if not any(c not in conflict_cols for c in columns):
        sql = f"INSERT INTO {table} ({cols}) VALUES %s ON CONFLICT ({', '.join(conflict_cols)}) DO NOTHING"
    psycopg2.extras.execute_values(cur, sql, rows, page_size=1000)
    conn.commit()
    cur.close()


def append_rows(conn, table, columns, rows):
    cur = conn.cursor()
    cols = ", ".join(columns)
    sql = f"INSERT INTO {table} ({cols}) VALUES %s ON CONFLICT DO NOTHING"
    psycopg2.extras.execute_values(cur, sql, rows, page_size=1000)
    conn.commit()
    cur.close()
