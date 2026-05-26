import logging

logger = logging.getLogger(__name__)

SEED_FAQS = [
    {
        "id": "seed_001",
        "question": "How do I enroll in a course?",
        "answer": "To enroll in a course, navigate to the course catalog, select the course you're interested in, and click the 'Enroll Now' button. If the course requires payment, you'll be directed to the checkout page. Once payment is confirmed, you'll have immediate access to the course materials."
    },
    {
        "id": "seed_002",
        "question": "What payment methods are accepted?",
        "answer": "We accept Visa, MasterCard, American Express, PayPal, and bank transfers. For annual subscriptions, we also offer invoice-based payments for enterprise customers. All transactions are secured with 256-bit SSL encryption."
    },
    {
        "id": "seed_003",
        "question": "How do I get my course completion certificate?",
        "answer": "Certificates are automatically generated once you complete all required modules and pass the final assessment with a score of 70% or higher. You can download your certificate from the 'My Certificates' section in your profile. Certificates include a unique verification URL."
    },
    {
        "id": "seed_004",
        "question": "What are the technical requirements for taking courses?",
        "answer": "You need a modern web browser (Chrome, Firefox, Safari, or Edge), a stable internet connection of at least 5 Mbps, and a device with a minimum screen resolution of 1024x768. For courses with video content, we recommend at least 10 Mbps. Mobile devices are supported through our responsive web app."
    },
    {
        "id": "seed_005",
        "question": "Can I get a refund for a purchased course?",
        "answer": "Yes, we offer a 30-day money-back guarantee for all individual course purchases. To request a refund, go to 'My Purchases' in your account settings and click 'Request Refund' next to the course. Refunds are processed within 5-7 business days. Note: refunds are not available if you've completed more than 50% of the course."
    },
    {
        "id": "seed_006",
        "question": "How do proctored exams work?",
        "answer": "Proctored exams use AI-powered webcam monitoring to ensure exam integrity. Before starting, you'll need to verify your identity with a photo ID, ensure your webcam and microphone are working, and close all other applications. The proctor system monitors for suspicious activity and flags any anomalies for review."
    },
    {
        "id": "seed_007",
        "question": "How long do I have access to a course after purchasing?",
        "answer": "Individual course purchases grant lifetime access to the course materials, including any future updates. Subscription-based access lasts for the duration of your active subscription. If your subscription expires, you retain access to any certificates earned but lose access to course content."
    },
    {
        "id": "seed_008",
        "question": "What happens if I miss an assignment deadline?",
        "answer": "For self-paced courses, there are no strict deadlines — you can complete assignments at your convenience. For instructor-led courses, late submissions receive a 10% penalty per day, up to 3 days late. After 3 days, you must contact your instructor to request an extension. Deadlines can be viewed in the course calendar."
    },
    {
        "id": "seed_009",
        "question": "How is my course grade calculated?",
        "answer": "Course grades are typically weighted as follows: quizzes (20%), assignments (30%), midterm exam (20%), and final exam (30%). Some courses may use different weightings, which are listed in the course syllabus. You need a minimum overall grade of 70% to earn a certificate."
    },
    {
        "id": "seed_010",
        "question": "Can I transfer my course progress to another account?",
        "answer": "Course progress cannot be transferred between accounts for academic integrity reasons. However, if you need to merge accounts (e.g., you accidentally created a duplicate), contact our support team with both account emails and we'll help consolidate your progress."
    },
    {
        "id": "seed_011",
        "question": "How do I reset my password?",
        "answer": "Click 'Forgot Password' on the login page and enter your registered email. You'll receive a password reset link within 5 minutes. The link expires after 24 hours. If you don't receive the email, check your spam folder or contact support. For security, we recommend using a password with at least 12 characters including numbers and symbols."
    },
    {
        "id": "seed_012",
        "question": "Are courses available in multiple languages?",
        "answer": "Many of our popular courses offer subtitles in up to 15 languages. The platform interface supports English, Spanish, French, German, Portuguese, Japanese, Korean, and Mandarin. Some courses also offer fully translated versions. You can set your language preference in account settings."
    },
    {
        "id": "seed_013",
        "question": "How do I contact my instructor?",
        "answer": "You can reach your instructor through the course discussion forum, direct messaging within the platform, or during scheduled office hours. Instructors typically respond within 24-48 hours on business days. For urgent issues, use the 'Priority Message' option which guarantees a response within 12 hours."
    },
    {
        "id": "seed_014",
        "question": "What is the group/team enrollment discount?",
        "answer": "We offer volume discounts for team enrollments: 10-24 seats receive 15% off, 25-99 seats receive 25% off, and 100+ seats receive 35% off. Enterprise plans also include dedicated account management, custom learning paths, and analytics dashboards. Contact our sales team for a custom quote."
    },
    {
        "id": "seed_015",
        "question": "Can I download course materials for offline use?",
        "answer": "Yes, most courses allow downloading video lectures, slides, and reading materials for offline access through our mobile app. Downloaded content is available for 30 days offline before requiring a sync. Note that some premium content may have download restrictions due to licensing agreements."
    }
]


def seed_if_empty(collection) -> bool:
    """Seed the collection with FAQ data if it's empty. Returns True if seeded."""
    try:
        count = collection.count()
        if count > 0:
            logger.info(f"Collection already has {count} entries — skipping seed.")
            return False

        ids = [faq["id"] for faq in SEED_FAQS]
        documents = [faq["answer"] for faq in SEED_FAQS]
        metadatas = [{"question": faq["question"], "source": "seeded"} for faq in SEED_FAQS]

        collection.add(ids=ids, documents=documents, metadatas=metadatas)
        logger.info(f"Seeded {len(SEED_FAQS)} FAQ entries.")
        return True
    except Exception as e:
        logger.error(f"Seeding error: {e}")
        return False
