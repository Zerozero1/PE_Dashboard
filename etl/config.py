import os

ORIGIN = dict(
    host=os.environ["BDCFM_HOST"],
    port=int(os.environ.get("BDCFM_PORT", "5432")),
    dbname=os.environ["BDCFM_DB"],
    user=os.environ["BDCFM_USER"],
    password=os.environ["BDCFM_PASSWORD"],
)

DW = dict(
    host=os.environ["DW_HOST"],
    port=int(os.environ.get("DW_PORT", "5432")),
    dbname=os.environ["DW_DB"],
    user=os.environ["DW_USER"],
    password=os.environ["DW_PASSWORD"],
)

DW_SCHEMA = os.environ.get("DW_SCHEMA", "prescricao")
BATCH_SIZE = int(os.environ.get("ETL_BATCH_SIZE", "2000000"))
