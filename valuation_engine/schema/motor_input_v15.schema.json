{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "title":"G2EXCHANGE input v1.5 (tasas fracción)","type":"object",
  "required":["template_code","company_id","instrument_id","company_name","ticker","market","valuation_date","price_per_share","diluted_shares","gross_debt_fy0","cash_fy0","risk_free_rate","sector_beta","equity_risk_premium","tax_rate","credit_spread","spread_credito_optimista","spread_credito_pesimista","terminal_growth_max","financials","valuation_run_id","input_snapshot_id","reporting_currency","valuation_currency","currency","fx_rate_used"],
  "properties":{
    "template_code":{"type":"string","pattern":"^(0[1-9]|1[0-6])$"},
    "market":{"enum":["US","JP","TW"]},
    "risk_free_rate":{"type":"number"},"sector_beta":{"type":"number"},"equity_risk_premium":{"type":"number","minimum":0,"maximum":0.3},
    "price_per_share":{"type":"number","exclusiveMinimum":0},"diluted_shares":{"type":"number","exclusiveMinimum":0},
    "gross_debt_fy0":{"type":"number","minimum":0},"tax_rate":{"type":"number","minimum":0,"maximum":1},
    "financials":{"type":"array","minItems":4,"maxItems":4},
    "wacc_adjustments":{"type":"object"},"risk_inputs":{"type":"object"},"sector_specific":{"type":"object"}
  }
}
