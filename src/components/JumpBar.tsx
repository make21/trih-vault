"use client";

const periods = [
  { id: "prehistory", label: "Prehistory" },
  { id: "antiquity", label: "Antiquity" },
  { id: "late-antiquity", label: "Late Antiquity" },
  { id: "middle-ages", label: "Middle Ages" },
  { id: "early-modern", label: "Early Modern" },
  { id: "c19", label: "19th Century" },
  { id: "c20", label: "20th Century" },
  { id: "c21", label: "21st Century" },
  { id: "undated", label: "Undated" }
] as const;

export default function JumpBar(): JSX.Element {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        background: "#fff",
        padding: "0.5rem",
        borderBottom: "1px solid #e5e5e5",
        zIndex: 10
      }}
    >
      {periods.map((period) => (
        <a
          key={period.id}
          href={`#bucket-${period.id}`}
          style={{ marginRight: "0.75rem", textDecoration: "underline", fontSize: "0.9rem" }}
        >
          {period.label}
        </a>
      ))}
    </nav>
  );
}
