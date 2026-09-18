// Keep this in sync with server/src/store.js's AGREEMENT_VERSION, and with
// the source Tikdum_Service_Provider_Agreement.pdf. Bump both together
// whenever the wording actually changes, so a provider who accepted an
// older version is asked to accept again.
export const AGREEMENT_VERSION = "2026-01";

export const AGREEMENT_SECTIONS = [
  [
    "1. Purpose of the Platform",
    "Tikdum is a technology platform that connects customers seeking services with independent service providers who offer those services. Tikdum provides a digital platform through which customers can discover and request services and service providers can receive requests, communicate with customers and provide services directly.",
  ],
  [
    "2. Independent Service Provider",
    "The Service Provider is an independent service provider and is not an employee, agent, partner, franchisee or representative of Tikdum. Registration does not create an employer-employee relationship, partnership, joint venture, agency or franchise relationship.",
  ],
  [
    "3. Service Provider Eligibility",
    "The Service Provider confirms that registration information is true and accurate, that it is legally authorised to provide its listed services, and that it will maintain all licences, permits, certifications and registrations required by applicable law.",
  ],
  [
    "4. Service Provider Platform Fee",
    "The Service Provider agrees to pay Tikdum a platform/service facilitation charge for eligible service requests. For the applicable service category, the charge shall be ₹14 per service OR 10% of the applicable service amount, whichever is lower. Where a service category is specifically designated under the second applicable fee slab, the charge shall be ₹40 per service OR 10% of the applicable service amount, whichever is lower. The applicable slab may depend on the service category or commercial terms communicated by Tikdum.",
  ],
  [
    "5. Service Request Rejection Charge",
    "When a genuine service request is delivered through Tikdum and the Service Provider rejects, declines or unnecessarily refuses it, a ₹15 service-request rejection charge may apply. Tikdum may waive the charge where the rejection occurred because of circumstances reasonably outside the Service Provider's control.",
  ],
  [
    "6. Repeated Service Request Rejections",
    "If a Service Provider reaches 10 or more qualifying service-request rejections, Tikdum may apply additional account-management or rejection charges. Where applicable, a charge of ₹100 per subsequent qualifying service-request rejection may be imposed. Tikdum may also temporarily restrict, suspend or review the account.",
  ],
  [
    "7. Customer Complaints",
    "Customer complaints may relate to poor or incomplete service, misconduct, misrepresentation, unauthorised charges, failure to provide an accepted service, property damage, harassment, fraud, safety concerns, false information or other material violations. Tikdum may review complaints and request reasonable supporting information.",
  ],
  [
    "8. Customer Complaint Threshold and Account Blocking",
    "If a Service Provider receives more than 10 substantiated or qualifying customer complaints, Tikdum may block, suspend or terminate the Service Provider ID. Serious misconduct, fraud, threats, harassment, illegal activity or safety concerns may result in immediate action irrespective of the number of complaints.",
  ],
  [
    "9. ID Reactivation / Renewal After Blocking",
    "Where Tikdum permits reactivation of an ID blocked because of repeated complaints, serious violations or other material breaches, the Service Provider may be required to pay a ₹10,000 Platform Reinstatement & Compliance Review Fee. Payment does not automatically guarantee reinstatement.",
  ],
  [
    "10. Tikdum Does Not Guarantee Business",
    "Registration does not guarantee any minimum number of customers, service requests, income, revenue or business opportunities. Demand depends on customer requirements, location, service category, competition and other factors.",
  ],
  [
    "11. Customer and Service Provider Responsibilities",
    "The Service Provider and customer are independently responsible for agreeing upon service requirements, scope of work, price, timing, location, materials, additional charges, cancellation terms, completion and payment. Tikdum primarily facilitates the connection.",
  ],
  [
    "12. Payment Responsibility",
    "Unless Tikdum expressly provides a payment-collection service for a particular transaction, Tikdum is not responsible for collecting payment from the customer on behalf of the Service Provider. The Service Provider and customer are responsible for resolving payment matters directly between themselves.",
  ],
  [
    "13. Non-Payment by Customer",
    "Tikdum is not liable for a customer's failure, refusal, delay or inability to pay the Service Provider unless Tikdum has expressly accepted payment responsibility under separate written terms.",
  ],
  [
    "14. Service Quality",
    "The Service Provider is solely responsible for quality of work, professional standards, staff, equipment, materials, licences, safety procedures, customer communication and completion of work. Tikdum does not supervise or control the manner in which services are performed.",
  ],
  [
    "15. Customer Information",
    "Tikdum may provide relevant customer information necessary to facilitate a request, such as name, contact number, service location, requirements and booking information. The Service Provider must use such information only for legitimate purposes connected with the requested service.",
  ],
  [
    "16. Privacy and Data Protection",
    "The Service Provider must keep customer information confidential, must not sell, publish, share or misuse it, and must take reasonable measures to protect it. Misuse of customer information may result in immediate suspension or termination.",
  ],
  [
    "17. Prohibited Conduct",
    "The Service Provider must not commit fraud, misrepresent services, submit false documents, manipulate bookings or ratings, harass or threaten customers, demand unauthorised charges, misuse customer information, circumvent platform fees dishonestly, damage Tikdum systems, engage in illegal activity or impersonate Tikdum.",
  ],
  [
    "18. Direct Dealings with Customers",
    "The Service Provider may communicate directly with customers to complete requested services, but must not manipulate or falsify platform records to avoid legitimately applicable Tikdum charges.",
  ],
  [
    "19. Service Provider Licences and Compliance",
    "The Service Provider is solely responsible for obtaining and maintaining all licences, registrations, permits, insurance policies, tax registrations and professional qualifications required for its business or services.",
  ],
  [
    "20. Employees and Subcontractors",
    "Where employees, workers, contractors or subcontractors are used, the Service Provider remains responsible for their conduct and performance and must ensure compliance with applicable law and these Terms.",
  ],
  [
    "21. Property Damage, Injury and Service Disputes",
    "The Service Provider is responsible for its own acts and omissions and those of its personnel. Where customer property is damaged, a person is injured or a dispute arises because of the Service Provider's actions or services, the Service Provider shall be responsible as required by applicable law.",
  ],
  [
    "22. Customer-Service Provider Disputes",
    "Tikdum may provide communication or dispute-support facilities, but is not automatically a party to the underlying agreement between customer and Service Provider. Price, quality, damage, payment, delay, cancellation, refund and performance disputes remain primarily between them.",
  ],
  [
    "23. Limitation of Liability",
    "To the maximum extent permitted by applicable law, Tikdum shall not be responsible for indirect, incidental, special, consequential or punitive losses arising from dealings between customers and Service Providers, including loss of profits, business, opportunity or reputation, or service failures by an independent Service Provider. Nothing excludes liability that cannot lawfully be excluded.",
  ],
  [
    "24. Service Provider Indemnification",
    "To the maximum extent permitted by law, the Service Provider agrees to indemnify and hold harmless Tikdum, its owners, directors, officers, employees, contractors and affiliates from claims, losses, damages, penalties, costs and reasonable legal expenses arising from the Service Provider's services, negligence, misconduct, breach of these Terms, violation of law, customer disputes caused by the Service Provider, property damage, personal injury, data misuse or fraud.",
  ],
  [
    "25. Platform Availability",
    "Tikdum will make reasonable efforts to maintain the platform but does not guarantee uninterrupted or error-free availability. The platform may be unavailable due to maintenance, technical problems, internet or telecommunications failures, third-party failures, cybersecurity incidents, government restrictions or circumstances beyond reasonable control.",
  ],
  [
    "26. Account Security",
    "The Service Provider is responsible for account credentials, OTPs, passwords and authentication information and must immediately notify Tikdum of suspected unauthorised access.",
  ],
  [
    "27. Verification",
    "Tikdum may conduct identity, business, document, phone, location or other verification checks and may request identification, business registration, address proof, bank details, GST information, licences, certifications, insurance information or other reasonable documents.",
  ],
  [
    "28. Ratings and Reviews",
    "Customers may provide ratings and reviews based on their experience. Tikdum may remove or restrict reviews where there is evidence of fraud, manipulation, spam, abuse, false reviews or threats. Service Providers must not artificially manipulate ratings or reviews.",
  ],
  [
    "29. Account Suspension and Termination",
    "Tikdum may suspend, restrict, block or terminate a Service Provider account where it reasonably believes the Service Provider has violated these Terms, engaged in fraud, provided false information, misused customer data, harmed customers, attempted to circumvent fees, engaged in illegal activity or created material safety, compliance or reputational risk.",
  ],
  [
    "30. Voluntary Account Closure",
    "The Service Provider may request closure of its account. Closure does not automatically cancel outstanding platform fees, lawful amounts owed, existing contractual obligations or obligations intended to survive termination.",
  ],
  [
    "31. Fees and Taxes",
    "The Service Provider is responsible for applicable taxes, government charges, licences and statutory obligations arising from its business. Tikdum may charge applicable taxes on its own platform/service charges as required by law and may change its fee structure with appropriate notice.",
  ],
  [
    "32. Promotional Communications",
    "The Service Provider may receive communications relating to service requests, account activity, platform updates, security, payments, policies, promotions and other service-related matters, subject to applicable law and preferences.",
  ],
  [
    "33. Electronic Acceptance",
    "Clicking \"I Agree\", \"Sign Up\", \"Register\", \"Accept Terms\" or a similar button constitutes electronic acceptance of this Agreement to the extent permitted by applicable law.",
  ],
  [
    "34. Modification of Terms",
    "Tikdum may update these Terms to reflect changes in the platform, business requirements, legal requirements, security requirements, new services or operational requirements. Updated Terms may be communicated through the platform or other appropriate channels.",
  ],
  [
    "35. Intellectual Property",
    "All Tikdum trademarks, logos, software, designs, graphics, text, databases, technology and other platform content belong to Tikdum or its licensors. The Service Provider receives only a limited, non-exclusive and revocable right to use the platform for legitimate business purposes.",
  ],
  [
    "36. No Guarantee of Customer Information",
    "Although Tikdum may provide information necessary to facilitate a request, Tikdum does not guarantee every customer detail, customer availability, payment capability, customer behaviour, seriousness or completion of a transaction. The Service Provider should verify relevant information before commencing work.",
  ],
  [
    "37. Force Majeure",
    "Tikdum shall not be responsible for failure or delay caused by circumstances beyond its reasonable control, including natural disasters, war, civil disturbance, government restrictions, internet failures, telecommunications failures, cyber incidents, strikes, epidemics, infrastructure failures or other force majeure events.",
  ],
  [
    "38. Legal Compliance",
    "The Service Provider shall comply with all applicable laws, regulations and governmental requirements relevant to its services. Nothing authorises a Service Provider to provide a service for which it lacks required permission, qualification or licence.",
  ],
  [
    "39. Governing Law and Jurisdiction",
    "This Agreement shall be governed by the laws applicable in India. Subject to applicable law, disputes relating to this Agreement shall be subject to the jurisdiction of the competent courts in India.",
  ],
  [
    "40. Severability",
    "If any provision is determined to be invalid, unlawful or unenforceable, the remaining provisions shall continue to operate to the maximum extent permitted by law.",
  ],
  [
    "41. Entire Agreement",
    "This Agreement, together with Tikdum's Privacy Policy, platform rules, fee schedule and other applicable policies, constitutes the agreement governing the Service Provider's use of the platform.",
  ],
  [
    "42. Survival",
    "Provisions relating to payments, outstanding fees, confidentiality, privacy, intellectual property, indemnification, limitation of liability, dispute resolution and other provisions intended by their nature to continue shall survive termination to the extent permitted by law.",
  ],
];

export const AGREEMENT_DECLARATION = [
  "I have read and understood this Service Provider Agreement.",
  "The information submitted by me is true and accurate.",
  "I am legally authorised to provide the services listed on Tikdum.",
  "I understand that Tikdum is a technology/platform service connecting customers and independent service providers.",
  "I understand and accept the applicable Tikdum platform/service charges.",
  "I understand that qualifying service-request rejections may attract applicable rejection charges.",
  "I understand that repeated rejection may result in additional charges and/or account restrictions.",
  "I understand that repeated customer complaints may result in suspension, blocking or termination of my Service Provider ID.",
  "I understand that approved reactivation after blocking may require payment of the ₹10,000 Platform Reinstatement & Compliance Review Fee.",
  "I understand that Tikdum does not guarantee business, bookings, income or customer payments.",
  "I understand that I am responsible for the services I provide to customers.",
  "I understand that I am responsible for complying with applicable laws, licences and professional requirements.",
  "I agree to protect customer information and use it only for legitimate service purposes.",
  "I agree not to misuse the Tikdum platform.",
  "I agree to resolve customer-service and payment disputes responsibly and in accordance with applicable law.",
  "I agree to the Tikdum Privacy Policy and other applicable platform policies.",
];
