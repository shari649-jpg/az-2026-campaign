// src/pages/legal/TermsPage.jsx
import { LegalPageLayout, SectionHeading, MarkedList, ContactCard, L } from "./legalPageStyles";

const lead = { fontWeight: 700, color: L.teal };

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms and Conditions"
      effectiveDate="July 4, 2026"
      intro={`These Terms and Conditions ("Terms") govern your access to and use of the Arizona Coalition, LLC website, mobile application, and related services, including the Arizona Coalition Comms Hub (collectively, the "Services"). By accessing or using the Services, you agree to be bound by these Terms, our Privacy Policy, and our Ethical Use of AI Policy, each of which is incorporated into these Terms by reference.`}
      notice="PLEASE READ SECTION 18 CAREFULLY. IT REQUIRES DISPUTES TO BE RESOLVED THROUGH BINDING INDIVIDUAL ARBITRATION AND INCLUDES A CLASS-ACTION WAIVER."
    >
      <SectionHeading num="1">Company Information</SectionHeading>
      <p>Arizona Coalition, LLC is an Arizona limited liability company founded in 2026. We provide tools and services focused on progressive political messaging, civic engagement, advocacy, and related educational content.</p>

      <SectionHeading num="2">Eligibility</SectionHeading>
      <p>You must be at least 18 years old, or the age of majority in your jurisdiction if higher, to use the Services. By using the Services, you represent that you meet this requirement and have the legal capacity to enter into these Terms.</p>

      <SectionHeading num="3">Invitation-Only Access and Waitlist</SectionHeading>
      <p>Access to the Comms Hub is by invitation only. You may request access by submitting the waitlist form. Submitting a waitlist request does not guarantee access; we review requests and grant or deny access at our sole discretion.</p>
      <p>If your request is approved, you will receive an invitation link. Invitation links are personal to you, may not be shared or transferred, and expire after a limited period (currently 72 hours). We may revoke an invitation or approved access at any time.</p>

      <SectionHeading num="4">Account Registration and Verification</SectionHeading>
      <p>To use the Services, you must create an account, provide accurate, current, and complete information, and verify your email address. You agree to keep your account credentials secure and to notify us promptly of any unauthorized use. You are responsible for all activity that occurs under your account.</p>

      <SectionHeading num="5">Roles and Account Administration</SectionHeading>
      <p>Accounts are assigned a role (such as Member, Manager, or Administrator) that determines available permissions. Coalition administrators may change user roles, and may edit, disable, or delete accounts, at their discretion, including to enforce these Terms or protect the Services and their users.</p>

      <SectionHeading num="6">Usage Limits</SectionHeading>
      <p>We may impose limits on your use of the Services, including daily limits on AI-powered features that vary by account role. We may modify these limits, throttle usage, or restrict features at any time to manage costs, maintain performance, or prevent abuse.</p>

      <SectionHeading num="7">Acceptable Use</SectionHeading>
      <p>You agree to use the Services only for lawful purposes and in a manner consistent with civic engagement and progressive advocacy. You may not:</p>
      <MarkedList tone="terracotta" items={[
        "Harass, threaten, impersonate, or abuse other users or any other person.",
        "Post content that is hateful, discriminatory, defamatory, or incites violence.",
        "Use the Services to spread misinformation or disinformation.",
        "Interfere with elections, voter participation, or lawful civic processes.",
        "Upload malware, spam, or any harmful code.",
        "Use bots, scraping, or automated tools except as expressly authorized by us.",
        "Attempt to access non-public areas of the Services, bypass security measures, or circumvent usage limits.",
        "Share your account or invitation link with others.",
      ]} />

      <SectionHeading num="8">User Content and the Shared Library</SectionHeading>
      <p>You may submit content such as text, images, drafts, saved campaigns, rebuttals, articles, and other materials ("User Content"). You retain ownership of your User Content, but you grant Arizona Coalition, LLC a non-exclusive, worldwide, royalty-free license to host, store, reproduce, modify, display, and distribute User Content solely to operate, improve, and provide the Services.</p>
      <p><span style={lead}>Shared visibility.</span> Content you save to shared areas of the Services, including the Library, is visible to other coalition members with access to the Services. Do not save content to shared areas that you are not willing to share with other members.</p>
      <p><span style={lead}>Moderation.</span> Coalition Managers and Administrators may remove or delete any User Content from shared areas at their discretion, including content that violates these Terms.</p>
      <p>You represent that you have the rights needed to submit your User Content and that it does not violate any law or third-party rights.</p>

      <SectionHeading num="9">AI-Generated Content</SectionHeading>
      <p>The Services include artificial intelligence features that generate drafts, summaries, suggestions, coaching responses, and other outputs. AI-generated content is provided for convenience only and may be inaccurate, incomplete, biased, or outdated.</p>
      <p>You are responsible for reviewing, verifying, and editing AI-generated content before using or publishing it. You agree not to use AI features to create deceptive political content, voter suppression content, deepfakes, or other unlawful material.</p>
      <p><span style={lead}>Disclosures and compliance.</span> If you publish or distribute materials created with the Services, you are solely responsible for including any legally required disclosures, including "paid for by" attributions under campaign finance law and any synthetic-media or AI-content disclosures required by applicable law, including Arizona law governing synthetic media in elections.</p>
      <p>Your use of AI features is also governed by our Ethical Use of AI Policy.</p>

      <SectionHeading num="10">Intellectual Property</SectionHeading>
      <p>The Services, including our branding, design, text, graphics, software, and other content, are owned by Arizona Coalition, LLC or our licensors and are protected by applicable intellectual property laws. Except as expressly permitted, you may not copy, modify, distribute, sell, or reverse engineer any part of the Services.</p>

      <SectionHeading num="11">Third-Party Services and Data</SectionHeading>
      <p>The Services may integrate with or display content from third-party platforms and services, including authentication providers, media storage, embedded video, and publicly available datasets (such as the X Community Notes dataset). We are not responsible for the content, accuracy, availability, policies, or practices of third parties. Third-party data is provided "as is" and remains subject to the applicable third party's own terms and licenses. Your use of third-party services is governed by their own terms and privacy policies.</p>

      <SectionHeading num="12">Copyright Complaints</SectionHeading>
      <p>We respect intellectual property rights. If you believe content available through the Services infringes your copyright, send a notice to <a href="mailto:info@arizonacoalition.net" style={lead}>info@arizonacoalition.net</a> that includes: (a) identification of the copyrighted work; (b) identification and location of the allegedly infringing material; (c) your contact information; (d) a statement that you have a good-faith belief the use is not authorized; (e) a statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on the owner's behalf; and (f) your physical or electronic signature. We may remove content and may terminate the accounts of repeat infringers.</p>

      <SectionHeading num="13">No Professional Advice</SectionHeading>
      <p>The content provided through the Services is for informational purposes only and does not constitute legal, campaign finance, election law, or other professional advice. You are responsible for complying with all applicable laws and regulations.</p>

      <SectionHeading num="14">Internal Use; Confidentiality</SectionHeading>
      <p>The Services and their contents are intended for internal coalition use only and are not for public distribution. You agree not to publicly distribute, publish, or disclose non-public materials, data, research, or strategy content made available through the Services, except for content you create with the tools that is intended for publication as part of your own advocacy work.</p>

      <SectionHeading num="15">Suspension and Termination</SectionHeading>
      <p>We may suspend or terminate your access to the Services at any time if we believe you have violated these Terms, created risk to other users, or engaged in unlawful, abusive, or harmful conduct. You may stop using the Services at any time and may request deletion of your account by contacting us. Sections that by their nature should survive termination (including Sections 8, 10, and 12 through 19) will survive.</p>

      <SectionHeading num="16">Disclaimers</SectionHeading>
      <p>The Services are provided on an "as is" and "as available" basis without warranties of any kind, express or implied. We do not guarantee that the Services will be uninterrupted, secure, error-free, or free from harmful components.</p>

      <SectionHeading num="17">Limitation of Liability</SectionHeading>
      <p>To the fullest extent permitted by law, Arizona Coalition, LLC will not be liable for indirect, incidental, special, consequential, or punitive damages arising from or related to your use of the Services. Our total liability for any claim will not exceed the amount you paid us, if any, in the 12 months before the claim arose, or USD $100 if you did not pay anything.</p>

      <SectionHeading num="18">Dispute Resolution; Binding Arbitration; Class-Action Waiver</SectionHeading>
      <p><span style={lead}>Informal resolution first.</span> Before filing a claim, you agree to contact us at <a href="mailto:info@arizonacoalition.net" style={lead}>info@arizonacoalition.net</a> and attempt in good faith to resolve the dispute informally for at least 30 days.</p>
      <p><span style={lead}>Arbitration.</span> Except as provided below, any dispute, claim, or controversy arising out of or relating to these Terms or the Services will be resolved by binding individual arbitration administered by the American Arbitration Association ("AAA") under its Consumer Arbitration Rules. The arbitration will be seated in Maricopa County, Arizona, and may be conducted remotely where the AAA rules allow. Judgment on the award may be entered in any court of competent jurisdiction.</p>
      <p><span style={lead}>Class-action waiver.</span> You and Arizona Coalition, LLC each agree that disputes will be brought only in an individual capacity, and not as a plaintiff or class member in any purported class, collective, or representative proceeding. The arbitrator may not consolidate claims or preside over any form of representative or class proceeding.</p>
      <p><span style={lead}>Exceptions.</span> Either party may bring an individual claim in small-claims court, and either party may seek injunctive or other equitable relief in court for infringement or misuse of intellectual property rights.</p>
      <p><span style={lead}>Opt-out.</span> You may opt out of this arbitration agreement by emailing <a href="mailto:info@arizonacoalition.net" style={lead}>info@arizonacoalition.net</a> within 30 days of first accepting these Terms, stating your name, account email, and intent to opt out.</p>

      <SectionHeading num="19">Indemnification</SectionHeading>
      <p>You agree to indemnify and hold harmless Arizona Coalition, LLC, its members, managers, employees, and agents from claims, losses, liabilities, damages, and expenses arising from your use of the Services, your User Content, or your violation of these Terms.</p>

      <SectionHeading num="20">Changes to the Services or Terms</SectionHeading>
      <p>We may update, suspend, or discontinue any part of the Services at any time. We may also revise these Terms from time to time. If we do, we will update the Effective Date above and provide notice as appropriate. Continued use of the Services after changes are posted means you accept the revised Terms.</p>

      <SectionHeading num="21">Governing Law</SectionHeading>
      <p>These Terms are governed by the laws of the State of Arizona, without regard to conflict-of-law rules. Subject to Section 18, any claims not subject to arbitration must be brought in the state or federal courts located in Maricopa County, Arizona.</p>

      <SectionHeading num="22">Miscellaneous</SectionHeading>
      <p>These Terms, together with the Privacy Policy and Ethical Use of AI Policy, are the entire agreement between you and Arizona Coalition, LLC regarding the Services. If any provision is found unenforceable, the remaining provisions remain in effect. Our failure to enforce any provision is not a waiver. You may not assign these Terms without our consent; we may assign them in connection with a merger, acquisition, or sale of assets.</p>

      <SectionHeading num="23">Contact</SectionHeading>
      <ContactCard />
    </LegalPageLayout>
  );
}
