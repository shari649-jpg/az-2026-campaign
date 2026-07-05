// src/pages/legal/PrivacyPage.jsx
import { LegalPageLayout, SectionHeading, MarkedList, CategoryList, ContactCard, L } from "./legalPageStyles";

const lead = { fontWeight: 700, color: L.teal };

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      effectiveDate="July 4, 2026"
      intro={`This Privacy Policy explains how Arizona Coalition, LLC ("Arizona Coalition," "we," "us," or "our") collects, uses, shares, and protects information when you use our website, mobile application, and related services, including the Arizona Coalition Comms Hub (collectively, the "Services").`}
    >
      <SectionHeading num="1">Information We Collect</SectionHeading>
      <p>We may collect the following categories of information:</p>
      <CategoryList items={[
        { label: "Waitlist information", text: "If you request access to the Services, we collect your name, email address, organization, and social media handles that you choose to provide, before you have an account." },
        { label: "Account information", text: "Name, email address, username, password, role, profile details, and social media handles you provide." },
        { label: "Content you submit", text: "Messages, drafts, posts, files, campaign materials, saved Library items, feedback, and other content." },
        { label: "AI interaction data", text: "Prompts, outputs, edits, feedback, and related system logs when you use AI features." },
        { label: "Usage data", text: "Device type, browser type, IP address, log data, feature usage, daily AI usage counts, time stamps, and analytics data." },
        { label: "Location data", text: "Approximate location based on IP address." },
        { label: "Communications", text: "Emails, support requests, and other correspondence with us." },
      ]} />

      <SectionHeading num="2">How We Use Information</SectionHeading>
      <p>We use information to:</p>
      <MarkedList tone="teal" items={[
        "Provide, maintain, and improve the Services.",
        "Review waitlist requests and manage invitations.",
        "Create, verify, and manage your account.",
        "Generate and deliver features related to civic engagement and progressive political messaging.",
        "Enforce usage limits and role-based permissions.",
        "Personalize your experience and improve content relevance.",
        "Communicate with you about the Services, security updates, and policy changes.",
        "Detect, prevent, and investigate fraud, abuse, and security incidents.",
        "Monitor compliance with our Terms and Ethical Use of AI Policy.",
        "Analyze usage trends and improve product performance.",
      ]} />

      <SectionHeading num="3">Cookies and Local Storage</SectionHeading>
      <p>The Services use browser storage and similar technologies to function:</p>
      <CategoryList items={[
        { label: "Authentication", text: "Our authentication provider (Firebase) stores sign-in tokens in your browser to keep you logged in." },
        { label: "Local storage", text: "We store certain data in your browser, such as unsaved drafts, so you can resume work if you leave a page." },
        { label: "Server logs", text: "Our hosting provider records standard log data, such as IP address and request information." },
        { label: "Embedded content", text: "Public pages may embed third-party content, such as YouTube videos, and those third parties may set their own cookies subject to their own policies." },
      ]} />
      <p><strong>We do not use third-party advertising cookies or cross-site tracking.</strong></p>

      <SectionHeading num="4">AI and Automated Features</SectionHeading>
      <p>Several features of the Services use artificial intelligence to generate content, suggestions, coaching responses, or analysis. These features are powered by Claude, an AI model provided by Anthropic. When you use an AI feature, your prompt and related context are sent to Anthropic's API for processing. Under Anthropic's commercial API terms, this data is not used to train Anthropic's models by default.</p>
      <p>We may use prompts and related interactions to operate, troubleshoot, and improve these features, and to enforce usage limits.</p>
      <p>We aim to use AI in ways that respect privacy, support human oversight, and avoid discriminatory or manipulative outcomes. AI-generated outputs should be reviewed by users before any public or external use. For more detail, see our Ethical Use of AI Policy.</p>

      <SectionHeading num="5">How We Share Information</SectionHeading>
      <p>We share information with service providers that process it on our behalf to operate the Services. These currently include:</p>
      <CategoryList items={[
        { label: "Anthropic", text: "AI processing for AI-powered features." },
        { label: "Google (Firebase and related services)", text: "authentication, database, and file storage and retrieval." },
        { label: "Netlify", text: "website hosting, serverless functions, and data storage." },
        { label: "Resend", text: "transactional email delivery (such as invitations and welcome emails)." },
      ]} />
      <p>We may also share information with:</p>
      <CategoryList items={[
        { label: "Affiliates and partners", text: "Organizations working with us on civic engagement or advocacy initiatives, when you have authorized such sharing or when needed to provide requested services." },
        { label: "Legal and compliance recipients", text: "Government agencies, courts, or others when we believe disclosure is required by law or necessary to protect rights, safety, or the integrity of the Services." },
        { label: "Business transfers", text: "In connection with a merger, acquisition, financing, or sale of assets." },
      ]} />
      <p><strong>We do not sell your personal information for monetary consideration.</strong></p>

      <SectionHeading num="6">Political Viewpoint Sensitivity</SectionHeading>
      <p>Because the Services support progressive political advocacy, your use of the Services may indicate your political views, which some laws treat as sensitive information. We limit access to the Services to invited coalition members, restrict database access with security rules, and do not sell or use this information for advertising.</p>

      <SectionHeading num="7">Data Retention</SectionHeading>
      <p>We keep personal information only as long as reasonably necessary for the purposes described in this Privacy Policy, unless a longer period is required or permitted by law. Waitlist information for requests that are declined or not completed is retained only as long as reasonably necessary for administration and security purposes.</p>

      <SectionHeading num="8">Your Choices</SectionHeading>
      <p>Depending on your jurisdiction, you may have rights to:</p>
      <MarkedList tone="teal" items={[
        "Access the personal information we hold about you.",
        "Correct inaccurate information.",
        "Request deletion of certain information, including your account.",
        "Object to or restrict certain processing.",
        "Withdraw consent where processing is based on consent.",
        "Opt out of promotional communications.",
      ]} />
      <p>You may exercise these rights by contacting us at <a href="mailto:info@arizonacoalition.net" style={lead}>info@arizonacoalition.net</a>. We will verify your request and respond as required by applicable law.</p>

      <SectionHeading num="9">Security</SectionHeading>
      <p>We use reasonable administrative, technical, and physical safeguards to protect personal information, including authentication requirements, role-based access controls, and database security rules. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute security.</p>

      <SectionHeading num="10">Age Requirement</SectionHeading>
      <p>The Services are intended for adults. You must be at least 18 years old to use the Services, and we do not knowingly collect personal information from anyone under 18. If we learn that we have collected personal information from someone under 18, we will delete it.</p>

      <SectionHeading num="11">International Users</SectionHeading>
      <p>If you access the Services from outside the United States, your information may be processed in the United States or other jurisdictions where our service providers operate.</p>

      <SectionHeading num="12">Changes to This Policy</SectionHeading>
      <p>We may update this Privacy Policy from time to time. If we make material changes, we will update the Effective Date and provide notice as appropriate.</p>

      <SectionHeading num="13">Contact</SectionHeading>
      <ContactCard />
    </LegalPageLayout>
  );
}
