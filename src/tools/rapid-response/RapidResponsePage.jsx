import ToolPage from "../../components/ToolPage";

export default function RapidResponsePage() {
  return (
    <ToolPage
      eyebrow="Monitoring"
      title="Rapid Response"
      desc="Track breaking narratives, flag emerging attacks, and route them to the right response tool fast."
      accentColor="#4A4558"
      chainTo={{ label: "Have a narrative to rebut? Go to Rebuttal Generator", path: "/rebuttal" }}
    >
      <div style={{
        maxWidth: "var(--max-width)",
        margin: "0 auto",
        padding: "64px 24px",
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#4A4558",
          background: "#eeecf4",
          padding: "6px 14px",
          borderRadius: 20,
          marginBottom: 24,
        }}>
          ◌ Coming soon
        </div>
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontSize: 32,
          color: "var(--text)",
          marginBottom: 16,
        }}>
          Rapid Response is in development
        </h2>
        <p style={{
          fontSize: 17,
          color: "var(--text-mid)",
          lineHeight: 1.7,
          maxWidth: 520,
          margin: "0 auto 32px",
        }}>
          This tool will help you monitor emerging narratives, flag attacks as they surface,
          and route them directly to the Rebuttal Generator.
        </p>
        <p style={{ fontSize: 14, color: "var(--text-mute)" }}>
          In the meantime, use the{" "}
          <a href="/rebuttal" style={{ color: "#C1673A", fontWeight: 700 }}>
            Rebuttal Campaign Generator
          </a>{" "}
          to respond to false narratives.
        </p>
      </div>
    </ToolPage>
  );
}
