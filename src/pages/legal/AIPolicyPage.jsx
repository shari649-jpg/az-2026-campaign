// src/pages/legal/AIPolicyPage.jsx
import { LegalPageLayout, SectionHeading, MarkedList, CategoryList, ContactCard, L } from "./legalPageStyles";

export default function AIPolicyPage() {
  return (
    <LegalPageLayout
      title="Ethical Use of AI Policy"
      effectiveDate="July 4, 2026"
      intro={`This Ethical Use of AI Policy explains how Arizona Coalition, LLC uses artificial intelligence ("AI") in our Services and sets expectations for users, staff, contractors, and partners.`}
    >
      <SectionHeading num="1">Purpose</SectionHeading>
      <p>Arizona Coalition, LLC uses AI tools to support progressive political messaging, civic engagement, content drafting, research support, and related educational functions. We are committed to using AI responsibly, transparently, and in ways that respect human rights, privacy, fairness, and democratic participation.</p>

      <SectionHeading num="2">Core Principles</SectionHeading>
      <p>Our use of AI is guided by the following principles:</p>
      <CategoryList items={[
        { label: "Human oversight", text: "AI assists human decision-making; it does not replace it." },
        { label: "Transparency", text: "We aim to make clear when content or features are AI-assisted." },
        { label: "Fairness", text: "AI must not be used in discriminatory, manipulative, or harmful ways." },
        { label: "Privacy", text: "Sensitive personal information should not be exposed to AI systems without strong safeguards." },
        { label: "Accountability", text: "Humans remain responsible for AI-driven workflows and outputs." },
        { label: "Safety", text: "AI should not be used to create or amplify harmful, deceptive, or unlawful content." },
      ]} />

      <SectionHeading num="3">Permitted Uses</SectionHeading>
      <p>AI may be used for:</p>
      <MarkedList tone="teal" items={[
        "Coding and app creation.",
        "Drafting and editing political messaging.",
        "Generating summaries and educational content.",
        "Brainstorming campaign or advocacy ideas.",
        "Assisting with content organization and workflow support.",
        "Analyzing aggregated, non-sensitive engagement trends.",
        "Improving user experience and internal operations.",
      ]} />

      <SectionHeading num="4">Prohibited Uses</SectionHeading>
      <p>AI must not be used to:</p>
      <MarkedList tone="terracotta" items={[
        "Create deepfakes or synthetic media intended to deceive.",
        "Produce misinformation, disinformation, or manipulated political content.",
        "Target or suppress voters unlawfully.",
        "Harass, threaten, or intimidate individuals or groups.",
        "Infer or target people based on sensitive traits such as race, religion, health, or sexual orientation.",
        "Generate impersonation content that falsely appears to come from a real person or organization.",
        "State or imply that a real person has committed a crime, engaged in abuse, or appears in investigative files or released document sets, unless that fact is a confirmed public record (a criminal conviction or the person's own documented public admission). Unverified allegations must never be presented as fact.",
        "Process highly sensitive data in AI systems without explicit authorization and safeguards.",
      ]} />

      <SectionHeading num="5">User Responsibilities</SectionHeading>
      <p>Users of AI features agree to:</p>
      <MarkedList tone="teal" items={[
        "Review and fact-check all AI-generated outputs before use.",
        "Use AI in lawful, ethical, and non-deceptive ways.",
        "Avoid entering sensitive personal data unless the feature explicitly allows it and it is appropriate to do so.",
        <>Report harmful, biased, or misleading AI outputs to <a href="mailto:info@arizonacoalition.net" style={{ color: L.teal, fontWeight: 700 }}>info@arizonacoalition.net</a>.</>,
        "Follow all applicable laws and platform rules.",
      ]} />

      <SectionHeading num="6">Data Handling</SectionHeading>
      <p>We aim to minimize the data sent to AI systems. Where feasible, we anonymize or generalize sensitive information before processing. We do not intentionally use AI systems to exploit, suppress, or discriminate against any person or group.</p>

      <SectionHeading num="7">Review and Oversight</SectionHeading>
      <p>We may review AI features, logs, and usage patterns to evaluate safety, bias, accuracy, and policy compliance. We may modify, suspend, or disable AI features that create unacceptable risk.</p>

      <SectionHeading num="8">Training and Updates</SectionHeading>
      <p>We will provide internal guidance as needed and may update this Policy to reflect changes in law, technology, and best practices.</p>

      <div style={{ marginTop: 30 }}>
        <ContactCard />
      </div>
    </LegalPageLayout>
  );
}
