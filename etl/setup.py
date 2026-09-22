import sys

from common import connect_dw, log


def main():
    dw = connect_dw()
    cur = dw.cursor()
    for fname in ("schema.sql", "ddl_extra.sql"):
        with open(fname, encoding="utf-8") as f:
            cur.execute(f.read())
    dw.commit()
    cur.execute("SELECT count(*) FROM pg_tables WHERE schemaname='prescricao'")
    n = cur.fetchone()[0]
    log(f"schema aplicado: {n} tabelas em prescricao")
    cur.close()
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
