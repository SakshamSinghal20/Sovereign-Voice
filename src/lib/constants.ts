import type { LanguageOption, ParsedDocument } from '../types';

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', speechCode: 'en-IN', sarvamCode: 'en-IN', flag: '🇮🇳' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी', speechCode: 'hi-IN', sarvamCode: 'hi-IN', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', speechCode: 'ta-IN', sarvamCode: 'ta-IN', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', speechCode: 'te-IN', sarvamCode: 'te-IN', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', speechCode: 'bn-IN', sarvamCode: 'bn-IN', flag: '🇮🇳' }
];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_API_IMAGE_BYTES = 1024 * 1024;
export const ACCEPTED_DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const DEMO_PARSED_DOCUMENT: ParsedDocument = {
  fullName: 'Asha Sharma',
  documentNumber: 'XXXX XXXX 2847',
  dateOfBirth: '14 March 1994',
  address: 'Jaipur, Rajasthan',
  gender: 'Female',
  documentType: 'Aadhaar',
  issuedDate: 'Not visible',
  rawText:
    'Government of India Aadhaar identity document. Name: Asha Sharma. DOB: 14/03/1994. Gender: Female. Aadhaar Number: XXXX XXXX 2847. Address: Jaipur, Rajasthan. This is a fictional demo document.',
  fields: {
    'Full Name': 'Asha Sharma',
    'Document Number': 'XXXX XXXX 2847',
    'Date of Birth': '14 March 1994',
    Gender: 'Female',
    Address: 'Jaipur, Rajasthan',
    'Document Type': 'Aadhaar'
  },
  confidence: 0.93
};

export const DEMO_MESSAGES = {
  en: 'I have analyzed the demo Aadhaar. Ask me about the name, document number, DOB, gender, or address.',
  hi: 'मैंने डेमो आधार दस्तावेज़ पढ़ लिया है। आप नाम, आधार नंबर, जन्म तिथि, लिंग या पते के बारे में पूछ सकते हैं।',
  ta: 'டெமோ ஆதார் ஆவணத்தை ஆய்வு செய்துவிட்டேன். பெயர், எண், பிறந்த தேதி, பாலினம் அல்லது முகவரி பற்றி கேளுங்கள்.',
  te: 'డెమో ఆధార్ పత్రాన్ని పరిశీలించాను. పేరు, నంబర్, పుట్టిన తేదీ, లింగం లేదా చిరునామా గురించి అడగండి.',
  bn: 'আমি ডেমো আধার নথিটি পড়েছি। নাম, নম্বর, জন্মতারিখ, লিঙ্গ বা ঠিকানা সম্পর্কে জিজ্ঞেস করুন।'
};

export const SAMPLE_QUESTIONS = {
  en: ['What is this document?', 'Extract all details', 'Is my name correct?'],
  hi: ['यह कौन सा दस्तावेज़ है?', 'सारी जानकारी निकालें', 'क्या मेरा नाम सही है?'],
  ta: ['இது என்ன ஆவணம்?', 'அனைத்து விவரங்களையும் எடு', 'என் பெயர் சரியா?'],
  te: ['ఇది ఏ పత్రం?', 'అన్ని వివరాలు చూపించు', 'నా పేరు సరైనదా?'],
  bn: ['এটি কোন নথি?', 'সব তথ্য বের করুন', 'আমার নাম কি ঠিক আছে?']
};

export const ERROR_COPY = {
  en: 'Something went wrong. Please try again.',
  hi: 'कुछ गलत हो गया। कृपया फिर से प्रयास करें।',
  ta: 'ஏதோ தவறு ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.',
  te: 'ఏదో తప్పు జరిగింది. దయచేసి మళ్లీ ప్రయత్నించండి.',
  bn: 'কিছু ভুল হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
};

export const FIELD_LABELS = {
  en: {
    fullName: 'Full Name',
    documentNumber: 'Document Number',
    dateOfBirth: 'Date of Birth',
    gender: 'Gender',
    address: 'Address',
    documentType: 'Document Type',
    issuedDate: 'Issued Date'
  },
  hi: {
    fullName: 'पूरा नाम',
    documentNumber: 'दस्तावेज़ नंबर',
    dateOfBirth: 'जन्म तिथि',
    gender: 'लिंग',
    address: 'पता',
    documentType: 'दस्तावेज़ का प्रकार',
    issuedDate: 'जारी करने की तारीख'
  },
  ta: {
    fullName: 'முழுப் பெயர்',
    documentNumber: 'ஆவண எண்',
    dateOfBirth: 'பிறந்த தேதி',
    gender: 'பாலினம்',
    address: 'முகவரி',
    documentType: 'ஆவண வகை',
    issuedDate: 'வெளியிட்ட தேதி'
  },
  te: {
    fullName: 'పూర్తి పేరు',
    documentNumber: 'పత్రం సంఖ్య',
    dateOfBirth: 'పుట్టిన తేదీ',
    gender: 'లింగం',
    address: 'చిరునామా',
    documentType: 'పత్రం రకం',
    issuedDate: 'జారీ తేదీ'
  },
  bn: {
    fullName: 'পূর্ণ নাম',
    documentNumber: 'নথি নম্বর',
    dateOfBirth: 'জন্মতারিখ',
    gender: 'লিঙ্গ',
    address: 'ঠিকানা',
    documentType: 'নথির ধরন',
    issuedDate: 'ইস্যুর তারিখ'
  }
};

export const ANSWER_ACTION_COPY = {
  en: { confidence: 'confidence', copy: 'Copy', readAloud: 'Read aloud' },
  hi: { confidence: 'भरोसा', copy: 'कॉपी', readAloud: 'सुनें' },
  ta: { confidence: 'நம்பிக்கை', copy: 'நகல்', readAloud: 'கேட்க' },
  te: { confidence: 'నమ్మకం', copy: 'కాపీ', readAloud: 'వినండి' },
  bn: { confidence: 'নিশ্চয়তা', copy: 'কপি', readAloud: 'শুনুন' }
};
