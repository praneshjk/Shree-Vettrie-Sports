// Shared Supabase project (same values are used in the admin site)
window.APP_CONFIG = {
  SUPABASE_URL: "https://ihgenjbayyaaghzilcgl.supabase.co",
  // Publishable (public) key – safe in the browser because Row Level Security protects the data.
  SUPABASE_KEY: "sb_publishable_hgSMj1ByGIp1f1kCRIRD6w_P18MY3FD",
  // Legacy anon key (use this instead if you ever see "Invalid API key"):
  // SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloZ2VuamJheXlhYWdoemlsY2dsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTQxNzYsImV4cCI6MjEwNjU5MDE3Nn0.Mx9jHvtiiqcGQZQXjuPO1RFZyGQEAKWhYyTTRVEQM9A",
  STORE_NAME: "Shree Vettrie Sports Empire",
  // Fallbacks – the admin panel's Settings page overrides these live from the database
  DEFAULTS: {
    upi_id: "118414533003174@cnrb",
    upi_name: "Shree Vettrie Sports Empire",
    phone1: "+91 95970 72373",
    phone2: "+91 86672 25698",
    pay_number: "9597072373",
    email: "shreevettrie@gmail.com",
    whatsapp: "919597072373",
    address: "118 B, Post Office Street, Near SBI Bank, Avinashi – 641 654.",
    gstin: "33EVVPR1226R1ZO",
    shipping_fee: "60",
    free_shipping_above: "1999"
  }
};
