/** Strings for the family-approval view. English + Bengali (the one non-English view in the app). */
export type Lang = 'en' | 'bn';

export const T = {
  title: { en: 'Tuition payment approval', bn: 'টিউশন ফি পরিশোধের অনুমোদন' },
  asks: { en: '{student} is asking you to approve this payment.', bn: '{student} এই পেমেন্টটি অনুমোদনের জন্য আপনাকে অনুরোধ করছে।' },
  sandbox: { en: 'SANDBOX — no real money moves', bn: 'স্যান্ডবক্স — কোনো আসল টাকা লেনদেন হয় না' },
  amount: { en: 'Amount', bn: 'পরিমাণ' },
  paidTo: { en: 'Paid to', bn: 'প্রাপক' },
  verified: { en: 'Verified university account', bn: 'যাচাইকৃত বিশ্ববিদ্যালয় অ্যাকাউন্ট' },
  dueDate: { en: 'Due date', bn: 'পরিশোধের শেষ তারিখ' },
  familyPays: { en: 'Family pays', bn: 'পরিবার পরিশোধ করবে' },
  via: { en: 'Via', bn: 'মাধ্যম' },
  trueCost: { en: 'True cost (fee + exchange-rate markup)', bn: 'প্রকৃত খরচ (ফি + বিনিময় হারের মার্কআপ)' },
  saving: { en: 'Saving compared with the bank', bn: 'ব্যাংকের তুলনায় সাশ্রয়' },
  rate: { en: 'Exchange rate', bn: 'বিনিময় হার' },
  fromGbp: { en: 'Paid from the UK account in pounds', bn: 'যুক্তরাজ্যের অ্যাকাউন্ট থেকে পাউন্ডে পরিশোধ' },
  whySafe: { en: 'Why is this safe?', bn: 'এটি কেন নিরাপদ?' },
  safe1: { en: "The bank details exactly match the university's verified record.", bn: 'ব্যাংকের তথ্য বিশ্ববিদ্যালয়ের যাচাইকৃত রেকর্ডের সঙ্গে হুবহু মিলেছে।' },
  safe2: { en: 'Only licensed transfer services are used — never hundi.', bn: 'শুধু লাইসেন্সপ্রাপ্ত মাধ্যম ব্যবহার করা হয় — কখনোই হুন্ডি নয়।' },
  safe3: { en: '{student} must also confirm with a one-time code. The payment needs both of you.', bn: '{student}কেও ওয়ান-টাইম কোড দিয়ে নিশ্চিত করতে হবে। পেমেন্টের জন্য আপনাদের দুজনেরই অনুমোদন লাগবে।' },
  safe4: { en: 'If the amount or account changes after this link was sent, the payment stops automatically.', bn: 'এই লিংক পাঠানোর পর পরিমাণ বা অ্যাকাউন্ট বদলালে পেমেন্ট স্বয়ংক্রিয়ভাবে বন্ধ হয়ে যাবে।' },
  approve: { en: 'Approve', bn: 'অনুমোদন করুন' },
  reject: { en: 'Reject', bn: 'প্রত্যাখ্যান করুন' },
  confirmApprove: { en: 'Approve {amount} to {payee}?', bn: '{payee}-কে {amount} পরিশোধ অনুমোদন করবেন?' },
  approved: { en: 'Approved. {student} can now complete the payment.', bn: 'অনুমোদিত। {student} এখন পেমেন্টটি সম্পন্ন করতে পারবে।' },
  rejected: { en: 'Rejected. The payment will not go ahead.', bn: 'প্রত্যাখ্যাত। পেমেন্টটি করা হবে না।' },
  once: { en: 'This link works once and expires on {date}.', bn: 'এই লিংকটি একবারই ব্যবহার করা যাবে এবং এর মেয়াদ শেষ হবে {date}।' },
  invalid: { en: 'This link cannot be used', bn: 'এই লিংকটি ব্যবহার করা যাবে না' },
  checklistTitle: { en: 'Student file: documents a Bangladeshi bank typically asks for', bn: 'স্টুডেন্ট ফাইল: বাংলাদেশের ব্যাংক সাধারণত যে কাগজপত্র চায়' },
  checklistIntro: {
    en: 'Paying tuition through a bank student file is the legal, protected route. Having these ready makes it faster.',
    bn: 'ব্যাংকের স্টুডেন্ট ফাইলের মাধ্যমে টিউশন ফি পাঠানো আইনসম্মত ও সুরক্ষিত পথ। এই কাগজগুলো আগে থেকে প্রস্তুত রাখলে কাজ দ্রুত হয়।',
  },
  checklistNote: {
    en: 'Requirements differ between banks and change over time. Always verify the exact list with your bank. This is a general guide (sandbox), not legal advice.',
    bn: 'ব্যাংকভেদে এবং সময়ের সঙ্গে প্রয়োজনীয় কাগজপত্র বদলায়। সঠিক তালিকা অবশ্যই আপনার ব্যাংকের কাছ থেকে যাচাই করে নিন। এটি একটি সাধারণ নির্দেশিকা (স্যান্ডবক্স), আইনি পরামর্শ নয়।',
  },
} as const;

export const CHECKLIST: { en: string; bn: string }[] = [
  { en: "Student's passport (copy)", bn: 'শিক্ষার্থীর পাসপোর্টের কপি' },
  { en: 'University offer letter or confirmation of enrolment', bn: 'বিশ্ববিদ্যালয়ের অফার লেটার বা ভর্তির নিশ্চয়তাপত্র' },
  { en: 'Tuition fee invoice or fee schedule from the university', bn: 'বিশ্ববিদ্যালয়ের টিউশন ফি ইনভয়েস বা ফি-র তালিকা' },
  { en: 'Student visa, or evidence of the visa application', bn: 'শিক্ষার্থী ভিসা, বা ভিসা আবেদনের প্রমাণ' },
  { en: 'Academic certificates and transcripts', bn: 'শিক্ষাগত সনদ ও ট্রান্সক্রিপ্ট' },
  { en: 'Passport-size photographs', bn: 'পাসপোর্ট সাইজের ছবি' },
  { en: "Sponsor's (parent's) national ID card", bn: 'স্পনসরের (অভিভাবকের) জাতীয় পরিচয়পত্র' },
  { en: "Sponsor's proof of income or source of funds", bn: 'স্পনসরের আয় বা অর্থের উৎসের প্রমাণ' },
  { en: "The bank's own student-file application form", bn: 'স্টুডেন্ট ফাইলের জন্য ব্যাংকের নিজস্ব আবেদন ফর্ম' },
];

export function t(key: keyof typeof T, lang: Lang, vars: Record<string, string> = {}): string {
  let s: string = T[key][lang];
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export function bnDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}
