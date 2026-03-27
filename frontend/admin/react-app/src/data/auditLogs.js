export const auditLogsData = [
    { id: 1,  timestamp: "2023-10-24 14:22:01.034", station: "STN_A_004",     eventType: "Emergency_Override", eventTypeBadge: "bg-error-container/20 text-error",                    user: "System.Kernel.Auto", action: "Pressure stabilization sequence active",   status: "Executing", statusColor: "bg-primary",   severity: "critical" },
    { id: 2,  timestamp: "2023-10-24 14:18:45.912", station: "STN_B_012",     eventType: "Calibration_Shift",  eventTypeBadge: "bg-secondary-container/20 text-secondary",            user: "Admin_U_882",        action: "Manual focal adjustment requested",        status: "Pending",   statusColor: "bg-secondary", severity: "warn"     },
    { id: 3,  timestamp: "2023-10-24 14:15:22.110", station: "GATE_01_AUTH",  eventType: "Access_Granted",     eventTypeBadge: "bg-surface-container-highest text-on-surface",        user: "Maint_Tech_A",       action: "Physical entrance secure",                 status: "Resolved",  statusColor: "bg-zinc-500",  severity: "info"     },
    { id: 4,  timestamp: "2023-10-24 14:12:01.002", station: "SERVER_ROOM_A", eventType: "Intrusion_Alert",    eventTypeBadge: "bg-error-container/20 text-error",                    user: "Unknown_Proxy",      action: "IP lockout sequence initiated",            status: "Locked",    statusColor: "bg-tertiary",  severity: "critical" },
    { id: 5,  timestamp: "2023-10-24 14:05:44.821", station: "STN_A_009",     eventType: "Routine_Check",      eventTypeBadge: "bg-surface-container-highest text-on-surface",        user: "System.Cron",        action: "Standard diagnostic payload complete",     status: "Complete",  statusColor: "bg-zinc-500",  severity: "info"     },
    { id: 6,  timestamp: "2023-10-24 13:58:12.441", station: "STN_C_112",     eventType: "Coolant_Level_Low",  eventTypeBadge: "bg-secondary-container/20 text-secondary",            user: "Sensor.H2O_01",      action: "Refill cycle scheduled",                   status: "Pending",   statusColor: "bg-secondary", severity: "warn"     },
    { id: 7,  timestamp: "2023-10-24 13:45:00.000", station: "STN_A_005",     eventType: "Sensor_Sync",        eventTypeBadge: "bg-surface-container-highest text-on-surface",        user: "System.Cron",        action: "All telemetry aligned",                    status: "Complete",  statusColor: "bg-zinc-500",  severity: "info"     },
    { id: 8,  timestamp: "2023-10-24 13:32:15.882", station: "PWR_GRID_02",   eventType: "Power_Cycle",        eventTypeBadge: "bg-secondary-container/20 text-secondary",            user: "Admin_J_404",        action: "Hard reboot of auxiliary systems",         status: "Executing", statusColor: "bg-primary",   severity: "warn"     },
    { id: 9,  timestamp: "2023-10-24 13:12:44.201", station: "STN_D_099",     eventType: "Update_Applied",     eventTypeBadge: "bg-surface-container-highest text-on-surface",        user: "Maint_Tech_B",       action: "Firmware version 2.4.1 stable",            status: "Resolved",  statusColor: "bg-zinc-500",  severity: "info"     },
    { id: 10, timestamp: "2023-10-24 12:55:01.011", station: "STN_B_001",     eventType: "Motor_Jam",          eventTypeBadge: "bg-error-container/20 text-error",                    user: "Auto.Observer",      action: "Emergency halt triggered",                 status: "Locked",    statusColor: "bg-tertiary",  severity: "critical" },
];

// ── Random log generator ───────────────────────────────────────────────────────

const _EVENT_POOL = [
    { eventType: "Emergency_Override", eventTypeBadge: "bg-error-container/20 text-error",             severity: "critical", statuses: [{ s: "Executing", c: "bg-primary"   }, { s: "Locked",    c: "bg-tertiary"  }] },
    { eventType: "Calibration_Shift",  eventTypeBadge: "bg-secondary-container/20 text-secondary",     severity: "warn",     statuses: [{ s: "Pending",   c: "bg-secondary" }, { s: "Executing", c: "bg-primary"   }] },
    { eventType: "Access_Granted",     eventTypeBadge: "bg-surface-container-highest text-on-surface", severity: "info",     statuses: [{ s: "Resolved",  c: "bg-zinc-500"  }, { s: "Complete",  c: "bg-zinc-500"  }] },
    { eventType: "Intrusion_Alert",    eventTypeBadge: "bg-error-container/20 text-error",             severity: "critical", statuses: [{ s: "Locked",    c: "bg-tertiary"  }, { s: "Executing", c: "bg-primary"   }] },
    { eventType: "Routine_Check",      eventTypeBadge: "bg-surface-container-highest text-on-surface", severity: "info",     statuses: [{ s: "Complete",  c: "bg-zinc-500"  }, { s: "Resolved",  c: "bg-zinc-500"  }] },
    { eventType: "Coolant_Level_Low",  eventTypeBadge: "bg-secondary-container/20 text-secondary",     severity: "warn",     statuses: [{ s: "Pending",   c: "bg-secondary" }] },
    { eventType: "Sensor_Sync",        eventTypeBadge: "bg-surface-container-highest text-on-surface", severity: "info",     statuses: [{ s: "Complete",  c: "bg-zinc-500"  }] },
    { eventType: "Power_Cycle",        eventTypeBadge: "bg-secondary-container/20 text-secondary",     severity: "warn",     statuses: [{ s: "Executing", c: "bg-primary"   }, { s: "Resolved",  c: "bg-zinc-500"  }] },
    { eventType: "Update_Applied",     eventTypeBadge: "bg-surface-container-highest text-on-surface", severity: "info",     statuses: [{ s: "Resolved",  c: "bg-zinc-500"  }, { s: "Complete",  c: "bg-zinc-500"  }] },
    { eventType: "Motor_Jam",          eventTypeBadge: "bg-error-container/20 text-error",             severity: "critical", statuses: [{ s: "Locked",    c: "bg-tertiary"  }, { s: "Executing", c: "bg-primary"   }] },
    { eventType: "Voltage_Spike",      eventTypeBadge: "bg-error-container/20 text-error",             severity: "critical", statuses: [{ s: "Executing", c: "bg-primary"   }] },
    { eventType: "Temp_Threshold",     eventTypeBadge: "bg-secondary-container/20 text-secondary",     severity: "warn",     statuses: [{ s: "Pending",   c: "bg-secondary" }] },
    { eventType: "Network_Anomaly",    eventTypeBadge: "bg-error-container/20 text-error",             severity: "critical", statuses: [{ s: "Locked",    c: "bg-tertiary"  }] },
    { eventType: "Auth_Timeout",       eventTypeBadge: "bg-secondary-container/20 text-secondary",     severity: "warn",     statuses: [{ s: "Resolved",  c: "bg-zinc-500"  }] },
    { eventType: "Pressure_Alert",     eventTypeBadge: "bg-error-container/20 text-error",             severity: "critical", statuses: [{ s: "Executing", c: "bg-primary"   }] },
    { eventType: "Checksum_Fail",      eventTypeBadge: "bg-secondary-container/20 text-secondary",     severity: "warn",     statuses: [{ s: "Pending",   c: "bg-secondary" }] },
];

const _STATIONS = [
    "STN_A_004", "STN_B_012", "GATE_01_AUTH", "SERVER_ROOM_A", "STN_A_009",
    "STN_C_112", "STN_A_005", "PWR_GRID_02",  "STN_D_099",     "STN_B_001",
    "STN_E_007", "STN_F_003", "CTRL_PANEL_01","ASSEMBLY_LINE_B","STN_G_021",
];

const _USERS = [
    "System.Kernel.Auto", "Admin_U_882",  "Maint_Tech_A", "Unknown_Proxy",
    "System.Cron",        "Sensor.H2O_01","Admin_J_404",  "Maint_Tech_B",
    "Auto.Observer",      "Ops_Lead_C",   "Net.Monitor",  "Admin_K_291",
    "Field_Tech_D",       "System.WDog",  "Audit.Agent",
];

const _ACTIONS = [
    "Pressure stabilization sequence active",
    "Manual focal adjustment requested",
    "Physical entrance secure",
    "IP lockout sequence initiated",
    "Standard diagnostic payload complete",
    "Refill cycle scheduled",
    "All telemetry aligned",
    "Hard reboot of auxiliary systems",
    "Firmware version 2.4.1 stable",
    "Emergency halt triggered",
    "Voltage regulation override applied",
    "Thermal limit approach detected",
    "Packet inspection flagged anomaly",
    "Session token expired — re-auth required",
    "Bearing torque exceeded threshold",
    "Safety interlock engaged",
    "Diagnostic scan initiated",
    "Remote access session terminated",
    "Backup relay switched to primary",
    "Calibration checkpoint logged",
];

let _nextId = auditLogsData.length + 1;

function _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function generateRandomLog() {
    const event  = _pick(_EVENT_POOL);
    const status = _pick(event.statuses);
    const now    = new Date();
    const pad    = (n, d = 2) => String(n).padStart(d, '0');
    const ms     = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    const timestamp =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${ms}`;
    return {
        id:             _nextId++,
        timestamp,
        station:        _pick(_STATIONS),
        eventType:      event.eventType,
        eventTypeBadge: event.eventTypeBadge,
        user:           _pick(_USERS),
        action:         _pick(_ACTIONS),
        status:         status.s,
        statusColor:    status.c,
        severity:       event.severity,
    };
}
