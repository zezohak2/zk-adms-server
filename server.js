const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.text({ type: "*/*", limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

app.get("/iclock/cdata", (req, res) => {
  const sn = req.query.SN || req.query.sn || "unknown";
  log(`REGISTER SN:${sn}`);
  const response = [
    `GET OPTION FROM: ${sn}`,
    `Stamp=9999`,
    `OpStamp=9999`,
    `ErrorDelay=60`,
    `Delay=30`,
    `TransTimes=00:00;23:59`,
    `TransInterval=1`,
    `TransFlag=1111000000`,
    `Realtime=1`,
    `Encrypt=0`,
  ].join("\r\n");
  res.status(200).send(response);
});

app.post("/iclock/cdata", async (req, res) => {
  const sn = req.query.SN || req.query.sn || "unknown";
  const table = req.query.table || req.query.Table || "";
  const body = typeof req.body === "string" ? req.body : "";
  log(`DATA SN:${sn} table:${table} body:${body.slice(0,100)}`);

  const lines = body.split("\n").filter(l => l.trim());
  let saved = 0;
  for (const line of lines) {
    const parts = line.trim().split(/\t/);
    if (parts.length < 2) continue;
    try {
      const empId = parts[0];
      const datetime = parts[1];
      const punchType = parseInt(parts[2] || "0");
      const punchTime = new Date(datetime);
      if (isNaN(punchTime.getTime())) continue;
      const { data: hrData } = await supabase.from("hr_data").select("value").eq("key","employees").maybeSingle();
      const employees = hrData?.value || [];
      const emp = employees.find(e => String(e.id)===String(empId)||String(e.idNumber)===String(empId));
      const { error } = await supabase.from("attendance").insert({
        employee_id: empId, name: emp?.name||empId,
        punch_time: punchTime.toISOString(), punch_type: punchType, device_sn: sn,
      });
      if (!error) saved++;
      else log(`DB ERROR: ${error.message}`);
    } catch(e) { log(`PARSE ERROR: ${e.message}`); }
  }
  res.status(200).send(`OK: ${saved}`);
});

app.get("/iclock/getrequest", (req, res) => {
  log(`GETREQUEST SN:${req.query.SN||"?"}`);
  res.status(200).send("OK");
});

app.post("/iclock/devicecmd", (req, res) => {
  log(`DEVICECMD SN:${req.query.SN||"?"}`);
  res.status(200).send("OK");
});

app.all("/iclock/test", (req, res) => {
  log(`TEST`); res.status(200).send("OK");
});

app.get("/", (req, res) => res.send("ZK ADMS Server ✅"));

app.listen(PORT, () => log(`Server on port ${PORT}`));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.text({ type: "*/*" }));
app.use(express.urlencoded({ extended: true }));

// ZKTeco ADMS endpoint
app.all("/iclock/cdata", async (req, res) => {
  const sn = req.query.SN || req.query.sn || "unknown";
  const action = (req.query.action || req.query.ACTION || "").toLowerCase();

  console.log(`[${new Date().toISOString()}] SN:${sn} Action:${action} Method:${req.method}`);

  // Handshake
  if (req.method === "GET" || action === "getrequest") {
    return res.status(200).send("GET OPTION:ATT LOG\nOK");
  }

  // استقبال سجلات الحضور
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? req.body : "";
    console.log("Body:", body);

    const lines = body.split("\n").filter(l => l.trim());
    let saved = 0;

    for (const line of lines) {
      const parts = line.trim().split(/\t|\s+/);
      if (parts.length < 3) continue;

      try {
        const empId = parts[0];
        const dateStr = parts[1];
        const timeStr = parts[2];
        const punchType = parseInt(parts[3] || "0");

        const punchTime = new Date(`${dateStr}T${timeStr}`);
        if (isNaN(punchTime.getTime())) continue;

        // جلب اسم الموظف
        const { data: hrData } = await supabase
          .from("hr_data")
          .select("value")
          .eq("key", "employees")
          .maybeSingle();

        const employees = hrData?.value || [];
        const emp = employees.find(e =>
          String(e.id) === String(empId) ||
          String(e.idNumber) === String(empId)
        );

        const { error } = await supabase.from("attendance").insert({
          employee_id: empId,
          name: emp?.name || empId,
          punch_time: punchTime.toISOString(),
          punch_type: punchType,
          device_sn: sn,
        });

        if (!error) saved++;
        else console.error("DB error:", error.message);

      } catch (e) {
        console.error("Parse error:", e.message);
      }
    }

    console.log(`Saved ${saved} records`);
    return res.status(200).send("OK");
  }

  res.status(200).send("OK");
});

// Health check
app.get("/", (req, res) => res.send("ZK ADMS Server running ✅"));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
