{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "title":"G2EXCHANGE output TS v1.5", "type":"object",
  "required":["motor","validation_status","valuation_run_id","input_snapshot_id","wacc_scenarios","valuations","warnings"],
  "properties":{
    "motor":{"const":"G2EXCHANGE_TS_v1.5"},"validation_status":{"enum":["REVIEW","BLOCKED"]},
    "wacc_scenarios":{"type":"array","minItems":3,"maxItems":3},
    "valuations":{"type":"array","minItems":3,"maxItems":3},
    "warnings":{"type":"array","items":{"type":"string"}}
  }
}
