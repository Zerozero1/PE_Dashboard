import sys

import jobs
from common import connect_dw, log


def main():
    dw = connect_dw()
    jobs.recover_stale(dw)
    jid = jobs.claim(dw)
    log(f"claim retornou: {jid}")
    if jid:
        jobs.finish(dw, jid, "success", "teste de mecanica do worker (sem pipeline)")
        log("finish aplicado")
    dw.close()


if __name__ == "__main__":
    sys.exit(main())
