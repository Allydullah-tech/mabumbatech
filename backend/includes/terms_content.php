<?php
/**
 * MABUMBA TECH — Terms & Conditions: single source of truth.
 *
 * The public website (fetched as JSON by frontend/js/terms.js, and rendered
 * into both the /public/terms.html page and the "read before you agree"
 * modal on the registration / service-request forms) AND the downloadable
 * PDF (/public/terms-pdf.php) are both built from this one array. Update the
 * wording here only — it can never drift out of sync between the two.
 *
 * Bump TERMS_VERSION in backend/config/constants.php whenever the wording
 * below changes materially; it's stamped on every stored acceptance
 * (users.terms_accepted_at/terms_version, service_requests.*) so a past
 * acceptance always stays tied to the text a person actually agreed to.
 */

function terms_updated_label(): string
{
    return 'September 2026';
}

/**
 * Ordered sections. Each has:
 *   id    — used as an HTML anchor (table of contents) and, together with the
 *           order below, defines the numbering shown to the user.
 *   title — heading text (already includes the "N." prefix where relevant).
 *   body  — plain text paragraph (no markup) so it renders cleanly in both
 *           HTML (wrapped in <p>) and the PDF (word-wrapped as-is).
 */
function terms_sections(): array
{
    return [
        [
            'id' => 'intro',
            'title' => 'Introduction',
            'body' => 'These Terms & Conditions ("Terms") govern the use of MABUMBA TECH\'s website and the provision of services by MABUMBA TECH ("we", "us", "our") to any individual, business, or organization requesting or receiving those services ("client", "you"). By creating an account, submitting a service request, or otherwise engaging our services, you confirm that you have read, understood, and agree to be bound by these Terms.',
        ],
        [
            'id' => 'services',
            'title' => '1. Our Services',
            'body' => 'MABUMBA TECH provides technology and digital services, including but not limited to web development, mobile/app development, AI & machine learning solutions, graphics design, IT consulting, and other digital services listed on our platform. The exact scope, deliverables, and timeline for a given engagement are agreed with the client when a service request is accepted, and may be documented separately (e.g. a quotation or project brief) for larger projects.',
        ],
        [
            'id' => 'payments',
            'title' => '2. Payments',
            'body' => 'Pricing is quoted per project based on its scope and complexity, and may be requested as a full upfront payment or in agreed instalments (e.g. deposit before work begins, balance on delivery). Work on a paid engagement begins only once the agreed payment terms have been met. Prices are quoted in Tanzanian Shillings (TZS) unless stated otherwise, and any bank/mobile-money transfer charges are the client\'s responsibility.',
        ],
        [
            'id' => 'project-requirements',
            'title' => '3. Project Requirements',
            'body' => 'To deliver a project accurately and on schedule, we rely on the client to provide complete and correct information at the start of the engagement — including project goals, content, branding assets, access credentials (where applicable), and any specific requirements. Work may pause, and timelines may shift, if information we reasonably need from the client is incomplete, delayed, or later changes materially from what was originally agreed.',
        ],
        [
            'id' => 'customer-responsibilities',
            'title' => '4. Customer Responsibilities',
            'body' => 'The client is responsible for: providing timely feedback and approvals during the project; ensuring any content, images, text, or materials they supply do not infringe a third party\'s rights; using delivered work in compliance with applicable law; and keeping their account credentials confidential. MABUMBA TECH is not liable for delays or issues caused by the client\'s failure to meet these responsibilities.',
        ],
        [
            'id' => 'intellectual-property',
            'title' => '5. Intellectual Property',
            'body' => 'Unless otherwise agreed in writing, ownership of the final, fully-paid deliverables transfers to the client upon full payment. MABUMBA TECH retains the right to reuse general know-how, pre-existing tools, code libraries, and frameworks that are not specific or confidential to the client\'s project, and may showcase completed work in its portfolio unless the client requests confidentiality in writing.',
        ],
        [
            'id' => 'revisions',
            'title' => '6. Revisions',
            'body' => 'A reasonable number of revisions to bring delivered work in line with the originally agreed scope are included at no extra cost. Requests that go beyond the original scope, or that are requested after a deliverable has already been approved, may be treated as a new task and quoted separately.',
        ],
        [
            'id' => 'cancellations-refunds',
            'title' => '7. Cancellations & Refunds',
            'body' => 'A client may request to cancel a project before work begins for a full refund of any amount already paid, less any costs already incurred on the client\'s behalf. Once work has started, refunds are considered on a case-by-case basis, reflecting the value of work already completed. Amounts paid for work that has been fully delivered and approved are non-refundable.',
        ],
        [
            'id' => 'confidentiality',
            'title' => '8. Confidentiality',
            'body' => 'Both parties agree to keep confidential any non-public business, technical, or personal information shared during the engagement, and to use it only for the purpose of completing the project. This obligation continues after the project ends and does not apply to information that is already public or independently known.',
        ],
        [
            'id' => 'third-party-services',
            'title' => '9. Third-Party Services',
            'body' => 'Some projects may rely on third-party platforms, tools, hosting providers, domain registrars, APIs, or payment gateways. MABUMBA TECH is not responsible for outages, policy changes, fees, or losses caused by those third parties, though we will assist the client in resolving such issues where reasonably possible.',
        ],
        [
            'id' => 'liability',
            'title' => '10. Limitation of Liability',
            'body' => 'MABUMBA TECH will perform services with reasonable skill and care, but does not guarantee that outcomes (e.g. specific business results, search rankings, or uptime of third-party infrastructure) will meet every expectation. To the extent permitted by law, our total liability for any claim arising from a project is limited to the amount the client paid us for that specific project, and we are not liable for indirect or consequential losses.',
        ],
        [
            'id' => 'termination',
            'title' => '11. Termination',
            'body' => 'Either party may terminate an ongoing engagement with written notice if the other party materially breaches these Terms and does not remedy the breach within a reasonable time after being notified. On termination, the client pays for all work completed up to that point, and MABUMBA TECH delivers whatever work has already been paid for.',
        ],
        [
            'id' => 'changes',
            'title' => '12. Changes to These Terms',
            'body' => 'We may update these Terms from time to time to reflect changes in our services or legal requirements. Continued use of our services after an update constitutes acceptance of the revised Terms. Material changes will be reflected by a new version number and date at the top of this page.',
        ],
        [
            'id' => 'governing-law',
            'title' => '13. Governing Law',
            'body' => 'These Terms are governed by the laws of the United Republic of Tanzania. Any dispute arising from these Terms or a project engagement will first be addressed through good-faith discussion between the parties.',
        ],
        [
            'id' => 'contact',
            'title' => '14. Contact Us',
            'body' => 'Questions about these Terms can be sent to mabumbatech@gmail.com or +255 620 839 640 / +255 760 620 418.',
        ],
    ];
}
