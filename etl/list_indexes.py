import sys

from common import connect_dw, log


def main():
    dw = connect_dw()
    cur = dw.cursor()
    cur.execute(
        "SELECT tablename, indexname, indexdef FROM pg_indexes "
        "WHERE schemaname='prescricao' ORDER BY tablename, indexname")
    rows = cur.fetchall()
    for t, i, d in rows:
        log(f"{t:38s} {i:44s} {d}")
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
