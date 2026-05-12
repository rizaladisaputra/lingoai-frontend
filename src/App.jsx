import React, { useState, useEffect, useRef } from 'react';
import { 
  Languages, Moon, Sun, Volume2, Copy, Check, ArrowRightLeft, 
  History, MessageSquare, Sparkles, AlertCircle, Loader2, PlayCircle, BookOpen,
  Maximize, Minimize, FileText, Download, UploadCloud, File, X, Type
} from 'lucide-react';

// --- CONFIG & CONSTANTS ---
const LANGUAGES = [
  { code: 'auto', name: 'Deteksi Otomatis' },
  { code: 'id', name: 'Indonesia' },
  { code: 'en', name: 'Inggris' },
  { code: 'ja', name: 'Jepang' },
  { code: 'ko', name: 'Korea' },
  { code: 'es', name: 'Spanyol' },
  { code: 'fr', name: 'Prancis' },
  { code: 'de', name: 'Jerman' },
  { code: 'zh', name: 'Mandarin' }
];

const TONES = [
  { id: 'casual', name: 'Santai / Sehari-hari', icon: '☕' },
  { id: 'formal', name: 'Formal', icon: '👔' },
  { id: 'semi-formal', name: 'Semi Formal', icon: '💼' },
  { id: 'business', name: 'Profesional Bisnis', icon: '📊' },
  { id: 'slang', name: 'Slang / Gaul', icon: '🤙' },
  { id: 'literary', name: 'Bahasa Buku / Sastra', icon: '📖' }
];

// --- HELPER FUNCTIONS ---
const speak = (text, langCode) => {
  if (!window.speechSynthesis) return alert('Browser tidak mendukung Text-to-Speech');
  
  const langMap = {
    'id': 'id-ID', 'en': 'en-US', 'ja': 'ja-JP', 'ko': 'ko-KR',
    'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE', 'zh': 'zh-CN'
  };
  
  // Clean up formatting markdown for speech
  const cleanText = text.replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
  
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = langMap[langCode] || 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
};

const loadExternalScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

const getPdfInfo = async (file) => {
  await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return { pdf, numPages: pdf.numPages };
};

// Ekstraksi canggih untuk mempertahankan baris, paragraf, dan styling (bold/italic)
const extractTextFromPDFRange = async (pdf, start, end) => {
  let fullText = '';
  const startIdx = Math.max(1, start);
  const endIdx = Math.min(pdf.numPages, end);
  
  for (let i = startIdx; i <= endIdx; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // 1. Ekstrak properti posisi dan font
    const items = textContent.items.map(item => {
      const fontName = item.fontName ? item.fontName.toLowerCase() : '';
      const isBold = fontName.includes('bold');
      const isItalic = fontName.includes('italic') || fontName.includes('oblique');
      
      let text = item.str;
      if (text.trim() !== '') {
        if (isBold && isItalic) text = `***${text}***`;
        else if (isBold) text = `**${text}**`;
        else if (isItalic) text = `*${text}*`;
      }
      
      return {
        str: text,
        origStr: item.str,
        x: item.transform[4],
        y: item.transform[5],
        height: item.height || item.transform[3]
      };
    });

    // 2. Urutkan berdasarkan koordinat Y (atas ke bawah), lalu X (kiri ke kanan)
    items.sort((a, b) => {
      if (Math.abs(a.y - b.y) < (a.height * 0.5)) return a.x - b.x;
      return b.y - a.y; // PDF Y menurun
    });

    // 3. Gabungkan kembali dengan logika jarak (spasi/enter)
    let pageText = '';
    let lastY = null;
    let lastX = null;

    for (const item of items) {
      if (item.origStr.trim() === '' && item.origStr !== ' ') continue;

      if (lastY !== null && Math.abs(lastY - item.y) > (item.height * 0.5)) {
        // Beda sumbu Y berarti baris baru. Cek seberapa jauh untuk enter ganda (paragraf)
        if (Math.abs(lastY - item.y) > item.height * 1.5) {
          pageText += '\n\n';
        } else {
          pageText += '\n';
        }
      } else if (lastY !== null && lastX !== null) {
        // Di baris yang sama, cek jarak horizontal untuk menambah spasi jika perlu
        if (item.x - lastX > (item.height * 0.2) && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' ';
        }
      }
      
      pageText += item.str;
      lastY = item.y;
      lastX = item.x + (item.origStr.length * (item.height * 0.4)); // Perkiraan akhir X kata saat ini
    }
    
    fullText += pageText + '\n\n';
  }
  return fullText;
};

// Helper untuk merender Markdown ringan (**bold**, *italic*) secara aman di React UI
const renderFormattedText = (text) => {
  if (!text) return null;
  const parts = text.split(/(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('***') && part.endsWith('***')) return <strong key={i} className="font-bold italic">{part.slice(3, -3)}</strong>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
};

// --- API CALL FUNCTION (KONEKSI KE BACKEND LOKAL) ---
const fetchAITranslation = async (inputText, sourceLang, targetLang, tone) => {
  const sourceName = LANGUAGES.find(l => l.code === sourceLang)?.name || 'Deteksi Otomatis';
  const targetName = LANGUAGES.find(l => l.code === targetLang)?.name || 'Inggris';
  const toneName = TONES.find(t => t.id === tone)?.name || 'Santai';

  const response = await fetch('http://localhost:5000/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      inputText, 
      sourceLang: sourceName, 
      targetLang: targetName, 
      tone: toneName 
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Server Error: ${response.status}`);
  }
  
  return await response.json();
};

// --- MAIN APP COMPONENT ---
export default function App() {
  // State: UI & Theme
  const [darkMode, setDarkMode] = useState(false);
  const [isFullWidth, setIsFullWidth] = useState(false);
  const [activeTab, setActiveTab] = useState('translator');
  
  // State: Translation
  const [inputText, setInputText] = useState('I’m feeling under the weather today.');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('id');
  const [tone, setTone] = useState('casual');
  
  // State: Typography Settings
  const [textSize, setTextSize] = useState('text-lg');
  const [fontStyle, setFontStyle] = useState('font-sans');
  
  // State: Results & Loading
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  
  // State: History & Conversation
  const [history, setHistory] = useState([]);
  const [chatLog, setChatLog] = useState([]);
  const [fullscreenData, setFullscreenData] = useState(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleSwapLanguage = () => {
    if (sourceLang !== 'auto') {
      const temp = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(temp);
      setInputText(result?.translation || '');
      setResult(null);
    }
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      const translatedData = await fetchAITranslation(inputText, sourceLang, targetLang, tone);
      
      if (translatedData) {
        setResult(translatedData);
        const historyItem = {
          id: Date.now(),
          original: inputText,
          translation: translatedData.translation,
          from: translatedData.detectedLanguage || sourceLang,
          to: targetLang,
          timestamp: new Date().toLocaleString('id-ID')
        };
        setHistory(prev => [historyItem, ...prev].slice(0, 50));
      } else {
        setError('Gagal memproses terjemahan dari AI.');
      }
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan saat menerjemahkan.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (result?.translation) {
      const cleanText = result.translation.replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
      navigator.clipboard.writeText(cleanText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // --- REUSABLE TYPOGRAPHY COMPONENT ---
  const TypographyControls = () => (
    <div>
      <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
        <Type size={16}/> Format Teks
      </label>
      <div className="flex gap-2">
        <select 
          value={fontStyle} 
          onChange={(e) => setFontStyle(e.target.value)} 
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="font-sans">Sans (Modern)</option>
          <option value="font-serif">Serif (Klasik)</option>
          <option value="font-mono">Mono (Mesin Tik)</option>
        </select>
        <select 
          value={textSize} 
          onChange={(e) => setTextSize(e.target.value)} 
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="text-sm">Kecil</option>
          <option value="text-base">Normal</option>
          <option value="text-lg">Besar</option>
          <option value="text-xl">Sangat Besar</option>
          <option value="text-2xl">Jumbo</option>
        </select>
      </div>
    </div>
  );

  // --- COMPONENT: TRANSLATOR VIEW ---
  const TranslatorView = () => (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <select 
          className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none w-full"
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
        >
          {LANGUAGES.map(l => <option key={`src-${l.code}`} value={l.code}>{l.name}</option>)}
        </select>
        
        <button 
          onClick={handleSwapLanguage}
          className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-gray-600 dark:text-gray-300 transition-colors"
          title="Tukar Bahasa"
        >
          <ArrowRightLeft size={20} />
        </button>

        <select 
          className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none w-full"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
        >
          {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={`tgt-${l.code}`} value={l.code}>{l.name}</option>)}
        </select>
      </div>

      {/* Tone & Typography Selection */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
        <div>
          <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 block">Gaya Bahasa (Tone)</label>
          <div className="flex flex-wrap gap-2">
            {TONES.map(t => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                  tone === t.id 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none' 
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span>{t.icon}</span> {t.name}
              </button>
            ))}
          </div>
        </div>
        <TypographyControls />
      </div>

      {/* Input / Output Area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Input Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col min-h-[250px]">
          <div className="p-4 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
            <span className="font-medium text-gray-500 dark:text-gray-400">Teks Asli</span>
          </div>
          <textarea
            className={`flex-1 p-6 bg-transparent resize-none outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 ${textSize} ${fontStyle}`}
            placeholder="Ketik teks yang ingin diterjemahkan..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <div className="p-4 flex justify-end items-center border-t border-gray-50 dark:border-gray-700">
            <button
              onClick={handleTranslate}
              disabled={isLoading || !inputText.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-colors"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              Terjemahkan
            </button>
          </div>
        </div>

        {/* Output Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col min-h-[250px] relative">
           <div className="p-4 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center bg-indigo-50/50 dark:bg-indigo-900/20">
            <span className="font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
              <Languages size={18} /> Hasil Terjemahan
            </span>
            {result && (
              <div className="flex gap-2">
                 <button onClick={() => speak(result.translation, targetLang)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Dengarkan">
                  <Volume2 size={18} />
                </button>
                <button onClick={handleCopy} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Salin">
                  {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                </button>
                <button onClick={() => setFullscreenData({ title: 'Hasil Terjemahan', text: result.translation, phonetic: result.phonetic, targetLang })} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Baca Layar Penuh">
                  <Maximize size={18} />
                </button>
              </div>
            )}
          </div>
          
          <div className="p-6 flex-1">
            {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                <Loader2 size={32} className="animate-spin text-indigo-500" />
                <p>AI sedang menganalisis kalimat...</p>
              </div>
            ) : error ? (
              <div className="text-red-500 flex items-center gap-2">
                <AlertCircle size={20} /> {error}
              </div>
            ) : result ? (
              <div className="space-y-4 animate-in fade-in duration-500">
                {result.correctedText && (
                  <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex gap-3 text-sm text-amber-800 dark:text-amber-200">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold mb-1">Koreksi Cerdas (Grammar/Typo):</p>
                      <p>"{result.correctedText}"</p>
                    </div>
                  </div>
                )}
                
                <div className="overflow-y-auto max-h-[300px] pr-2">
                  <div className={`text-gray-800 dark:text-white mb-2 whitespace-pre-wrap ${textSize} ${fontStyle}`}>
                    {renderFormattedText(result.translation)}
                  </div>
                  {result.phonetic && (
                    <p className="text-gray-500 dark:text-gray-400 font-mono text-sm mt-2">
                      /{result.phonetic}/
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 italic">
                Hasil terjemahan akan muncul di sini...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Deep Analysis Section */}
      {result && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 animate-in slide-in-from-bottom-4 duration-500">
          
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <BookOpen className="text-indigo-500" size={20} /> Penjelasan Grammar & Konteks
            </h3>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              {result.explanation}
            </p>
            
            {result.variations && result.variations.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold text-sm text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">Variasi Lebih Natural</h4>
                <div className="flex flex-col gap-2">
                  {result.variations.map((v, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-gray-900 px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300">
                      "{v}"
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-6">
            {result.importantWords && result.importantWords.length > 0 && (
              <div>
                <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  <Sparkles className="text-indigo-500" size={20} /> Kosakata Penting
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {result.importantWords.map((item, i) => (
                    <div key={i} className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{item.word}</span>
                      <span className="text-gray-500 dark:text-gray-400">{item.meaning}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.examples && result.examples.length > 0 && (
              <div>
                <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-3 text-sm uppercase tracking-wider text-gray-500">
                  Contoh Percakapan
                </h3>
                <ul className="space-y-3">
                  {result.examples.map((ex, i) => (
                    <li key={i} className="flex gap-3 text-gray-600 dark:text-gray-300">
                      <div className="mt-1"><PlayCircle size={16} className="text-indigo-400 cursor-pointer hover:text-indigo-600" onClick={() => speak(ex, targetLang)}/></div>
                      <span className="italic">"{ex}"</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );

  // --- COMPONENT: CONVERSATION MODE ---
  const ConversationView = () => {
    const [msgInput, setMsgInput] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const chatEndRef = useRef(null);

    const handleSendChat = async () => {
      if(!msgInput.trim()) return;
      
      const userMsg = { id: Date.now(), text: msgInput, sender: 'user', lang: sourceLang };
      setChatLog(prev => [...prev, userMsg]);
      setMsgInput('');
      setIsTranslating(true);

      try {
        const data = await fetchAITranslation(msgInput, sourceLang, targetLang, 'casual');
        if (data) {
          const botMsg = { 
            id: Date.now() + 1, 
            text: data.translation, 
            original: data.correctedText || msgInput,
            sender: 'bot', 
            lang: targetLang,
            phonetic: data.phonetic
          };
          setChatLog(prev => [...prev, botMsg]);
          speak(data.translation, targetLang);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsTranslating(false);
      }
    };

    useEffect(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatLog, isTranslating]);

    return (
      <div className={`${isFullWidth ? 'max-w-6xl' : 'max-w-3xl'} mx-auto h-[600px] bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-300`}>
        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-100 dark:border-indigo-800 flex justify-between items-center">
           <div className="flex gap-4 items-center">
              <span className="font-semibold text-indigo-800 dark:text-indigo-200">Mode Percakapan</span>
              <div className="flex items-center gap-2 text-sm bg-white dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                <span className="font-medium text-gray-700 dark:text-gray-300">{LANGUAGES.find(l=>l.code===sourceLang)?.name || 'Auto'}</span>
                <ArrowRightLeft size={14} className="text-gray-400" />
                <span className="font-medium text-gray-700 dark:text-gray-300">{LANGUAGES.find(l=>l.code===targetLang)?.name || 'Target'}</span>
              </div>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50 dark:bg-gray-900/50">
          {chatLog.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
              <MessageSquare size={48} className="text-gray-300 dark:text-gray-600" />
              <p>Mulai percakapan dalam bahasa apa saja!</p>
            </div>
          )}
          {chatLog.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${
                msg.sender === 'user' 
                ? 'bg-indigo-600 text-white rounded-br-none' 
                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-none border border-gray-100 dark:border-gray-700'
              }`}>
                <div className={`${textSize} ${fontStyle}`}>{renderFormattedText(msg.text)}</div>
                {msg.sender === 'bot' && msg.phonetic && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-sans">/{msg.phonetic}/</p>
                )}
              </div>
            </div>
          ))}
          {isTranslating && (
             <div className="flex justify-start">
               <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-none p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                  <Loader2 size={20} className="animate-spin text-indigo-500" />
               </div>
             </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex gap-3">
          <input 
            type="text"
            className={`flex-1 bg-gray-100 dark:bg-gray-900 border-none rounded-xl px-4 py-3 text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500 ${fontStyle}`}
            placeholder="Ketik pesan..."
            value={msgInput}
            onChange={(e) => setMsgInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
          />
          <button 
            onClick={handleSendChat}
            disabled={isTranslating || !msgInput.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            Kirim
          </button>
        </div>
      </div>
    );
  }

  // --- COMPONENT: HISTORY VIEW ---
  const HistoryView = () => (
    <div className={`${isFullWidth ? 'max-w-full' : 'max-w-4xl'} mx-auto space-y-4 transition-all duration-300`}>
      <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6">Riwayat Terjemahan</h2>
      {history.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">Belum ada riwayat terjemahan.</p>
      ) : (
        history.map((item) => (
          <div key={item.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span className="uppercase tracking-wider font-semibold">{item.from} → {item.to}</span>
              <span>{item.timestamp}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className={`text-gray-600 dark:text-gray-300 ${fontStyle}`}>{renderFormattedText(item.original)}</div>
               <div className={`font-medium text-gray-800 dark:text-white ${fontStyle}`}>{renderFormattedText(item.translation)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  // --- COMPONENT: DOCUMENT VIEW ---
  const DocumentView = () => {
    const [file, setFile] = useState(null);
    const [originalText, setOriginalText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [docStatus, setDocStatus] = useState('idle'); 
    const [docError, setDocError] = useState('');
    
    const [pdfRef, setPdfRef] = useState(null);
    const [numPages, setNumPages] = useState(0);
    const [startPage, setStartPage] = useState(1);
    const [endPage, setEndPage] = useState(1);

    const handleFileUpload = async (e) => {
      const selectedFile = e.target.files[0];
      if (!selectedFile) return;
      
      setFile(selectedFile);
      setDocStatus('extracting_info');
      setDocError('');
      setOriginalText('');
      setTranslatedText('');
      setPdfRef(null);
      setNumPages(0);

      try {
        if (selectedFile.type === 'application/pdf') {
          const { pdf, numPages } = await getPdfInfo(selectedFile);
          setPdfRef(pdf);
          setNumPages(numPages);
          setStartPage(1);
          setEndPage(numPages);
          setDocStatus('idle');
        } else if (selectedFile.type === 'text/plain') {
          const text = await selectedFile.text();
          if (!text.trim()) throw new Error("Tidak ada teks yang dapat diekstrak.");
          setOriginalText(text);
          setDocStatus('idle');
        } else {
          throw new Error("Format file tidak didukung. Mohon gunakan PDF atau TXT.");
        }
      } catch (err) {
        setDocError(err.message || "Gagal membaca file.");
        setDocStatus('idle');
      }
    };

    const handleTranslateDoc = async () => {
      setDocError('');
      let textToTranslate = originalText;
      
      try {
        if (file && file.type === 'application/pdf' && pdfRef) {
          setDocStatus('extracting');
          textToTranslate = await extractTextFromPDFRange(pdfRef, startPage, endPage);
          setOriginalText(textToTranslate);
        }

        if (!textToTranslate.trim()) {
          throw new Error("Tidak ada teks untuk diterjemahkan pada rentang halaman ini.");
        }

        setDocStatus('translating');
        const data = await fetchAITranslation(textToTranslate, sourceLang, targetLang, tone);
        if (data && data.translation) {
          setTranslatedText(data.translation);
          setDocStatus('done');
        } else {
          throw new Error("Gagal menerjemahkan dokumen.");
        }
      } catch (err) {
        setDocError(err.message || "Terjadi kesalahan saat menerjemahkan.");
        setDocStatus('idle');
      }
    };

    const handleDownloadPDF = async () => {
      try {
        await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        
        // Memformat teks menjadi HTML dengan mempertahankan baris, spasi ganda untuk paragraf, dan markdown tebal/miring
        const formattedHtml = translatedText
          .replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/\n\n/g, '</p><p style="margin-bottom: 16px; text-align: justify; line-height: 1.8;">')
          .replace(/\n/g, '<br/>');

        const htmlContent = `<p style="margin-bottom: 16px; text-align: justify; line-height: 1.8;">${formattedHtml}</p>`;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `
          <div style="padding: 40px; font-family: 'Times New Roman', Times, serif; color: #111827;">
            <h2 style="color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 24px; font-size: 22px; font-family: sans-serif;">
              Terjemahan: ${file?.name || 'Dokumen'}
            </h2>
            <div style="font-size: 13pt;">${htmlContent}</div>
            <div style="margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 9pt; color: #6b7280; text-align: right; font-family: sans-serif;">
              Diterjemahkan secara otomatis oleh LingoAI Translator
            </div>
          </div>
        `;
        
        const opt = {
          margin:       [10, 10, 10, 10], 
          filename:     `Terjemahan_${file?.name || 'dokumen'}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        window.html2pdf().set(opt).from(tempDiv).save();
      } catch (err) {
        alert("Gagal membuat PDF. Pastikan browser Anda mengizinkan proses pengunduhan.");
      }
    };

    return (
      <div className={`${isFullWidth ? 'max-w-full' : 'max-w-5xl'} mx-auto space-y-6 transition-all duration-300`}>
        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <select 
            className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none w-full"
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
          >
            {LANGUAGES.map(l => <option key={`src-${l.code}`} value={l.code}>{l.name}</option>)}
          </select>
          <ArrowRightLeft size={20} className="text-gray-400 hidden md:block" />
          <select 
            className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none w-full"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          >
            {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={`tgt-${l.code}`} value={l.code}>{l.name}</option>)}
          </select>
        </div>

        {/* Tone & Typography Selection */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
          <div>
            <label className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 block">Gaya Bahasa (Tone)</label>
            <div className="flex flex-wrap gap-2">
              {TONES.map(t => (
                <button
                  key={`doc-tone-${t.id}`}
                  onClick={() => setTone(t.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                    tone === t.id 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none' 
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span>{t.icon}</span> {t.name}
                </button>
              ))}
            </div>
          </div>
          <TypographyControls />
        </div>

        {/* Upload Area */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center relative border-dashed border-2 hover:border-indigo-500 transition-colors">
           <input 
             type="file" 
             accept=".pdf,.txt" 
             onChange={handleFileUpload} 
             className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
             title="Klik atau seret file PDF ke sini"
           />
           <UploadCloud size={48} className="text-indigo-400 mb-3" />
           <p className="text-gray-800 dark:text-gray-200 font-semibold mb-1 text-center">
             {docStatus === 'extracting_info' ? 'Memproses file...' : (file ? file.name : "Unggah Dokumen PDF atau TXT")}
           </p>
           <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
             Klik area ini atau seret file dokumen Anda ke sini
           </p>
        </div>

        {/* Page Selection */}
        {pdfRef && numPages > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row gap-4 items-center justify-between animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <FileText className="text-indigo-500" size={20}/>
              <span className="font-semibold text-gray-700 dark:text-gray-300">Total: {numPages} Halaman</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 dark:text-gray-400">Dari Halaman:</label>
              <input 
                type="number" 
                min="1" 
                max={numPages} 
                value={startPage}
                onChange={(e) => setStartPage(Math.max(1, Math.min(numPages, parseInt(e.target.value) || 1)))}
                className="w-20 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-center text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <label className="text-sm text-gray-600 dark:text-gray-400">Sampai:</label>
              <input 
                type="number" 
                min={startPage} 
                max={numPages} 
                value={endPage}
                onChange={(e) => setEndPage(Math.max(startPage, Math.min(numPages, parseInt(e.target.value) || numPages)))}
                className="w-20 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-center text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {docError && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-center gap-2">
            <AlertCircle size={20} /> {docError}
          </div>
        )}

        {/* Text Area */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
          {/* Teks Asli */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden">
             <div className="p-4 border-b border-gray-50 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-2 font-medium text-gray-600 dark:text-gray-300">
               <File size={18} /> Teks Ekstraksi Dokumen
             </div>
             <div className={`p-6 flex-1 overflow-y-auto whitespace-pre-wrap text-gray-700 dark:text-gray-300 leading-relaxed ${textSize} ${fontStyle}`}>
                {docStatus === 'extracting' ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-indigo-500 font-sans text-base">
                     <Loader2 className="animate-spin" size={32} /> Mengekstrak teks...
                  </div>
                ) : originalText ? (
                  renderFormattedText(originalText)
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 italic text-center font-sans text-base">
                    Teks asli dari dokumen Anda akan muncul di sini...
                  </div>
                )}
             </div>
          </div>

          {/* Teks Terjemahan */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden">
             <div className="p-4 border-b border-gray-50 dark:border-gray-700 bg-indigo-50/50 dark:bg-indigo-900/20 flex justify-between items-center">
               <span className="font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                 <Languages size={18} /> Hasil Terjemahan
               </span>
               <div className="flex items-center gap-2">
                 <button 
                   onClick={handleDownloadPDF} 
                   disabled={!translatedText}
                   className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                 >
                   <Download size={16} /> Unduh PDF
                 </button>
                 {translatedText && (
                   <button onClick={() => setFullscreenData({ title: `Terjemahan: ${file?.name || 'Dokumen'}`, text: translatedText, targetLang })} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700" title="Baca Layar Penuh">
                     <Maximize size={16} />
                   </button>
                 )}
               </div>
             </div>
             <div className={`p-6 flex-1 overflow-y-auto whitespace-pre-wrap text-gray-800 dark:text-gray-100 leading-relaxed ${textSize} ${fontStyle}`}>
                {docStatus === 'translating' ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-indigo-500 font-sans text-base">
                     <Loader2 className="animate-spin" size={32} /> Menerjemahkan dokumen...
                  </div>
                ) : translatedText ? (
                  renderFormattedText(translatedText)
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 italic text-center font-sans text-base">
                    Hasil terjemahan akan muncul di sini...
                  </div>
                )}
             </div>
          </div>
        </div>

        <div className="flex justify-end">
           <button 
             onClick={handleTranslateDoc} 
             disabled={(!originalText && !pdfRef) || docStatus === 'translating' || docStatus === 'extracting'}
             className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm"
           >
             {(docStatus === 'translating' || docStatus === 'extracting') ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
             {docStatus === 'extracting' ? 'Mengekstrak Teks...' : 'Mulai Terjemahkan'}
           </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] transition-colors duration-300 font-sans">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className={`${isFullWidth ? 'w-full px-6' : 'max-w-6xl mx-auto px-4'} h-16 flex items-center justify-between transition-all duration-300`}>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
               <Languages className="text-white" size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight">LingoAI</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsFullWidth(!isFullWidth)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
              title={isFullWidth ? "Tampilan Normal" : "Tampilan Layar Penuh"}
            >
              {isFullWidth ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
              title="Mode Gelap / Terang"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 cursor-pointer border-2 border-white dark:border-gray-800 shadow-sm" title="Profil Pengguna"></div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className={`${isFullWidth ? 'w-full px-6' : 'max-w-6xl mx-auto px-4'} py-8 transition-all duration-300`}>
        
        {/* Tabs Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-white dark:bg-gray-800 p-1.5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap justify-center gap-1">
            <button 
              onClick={() => setActiveTab('translator')}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'translator' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              <Languages size={18} /> Translator AI
            </button>
            <button 
              onClick={() => setActiveTab('document')}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'document' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              <FileText size={18} /> Dokumen
            </button>
            <button 
              onClick={() => setActiveTab('conversation')}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'conversation' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              <MessageSquare size={18} /> Percakapan
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'history' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              <History size={18} /> Riwayat
            </button>
          </div>
        </div>

        {/* Dynamic Content */}
        <div className="transition-opacity duration-300">
          {activeTab === 'translator' && <TranslatorView />}
          {activeTab === 'document' && <DocumentView />}
          {activeTab === 'conversation' && <ConversationView />}
          {activeTab === 'history' && <HistoryView />}
        </div>

      </main>

      {/* Fullscreen Result Overlay */}
      {fullscreenData && (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-900 flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 shadow-sm">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-3 font-sans">
              <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                <FileText size={20} />
              </div>
              {fullscreenData.title}
            </h2>
            <div className="flex items-center gap-2 md:gap-3">
              <button onClick={() => speak(fullscreenData.text, fullscreenData.targetLang)} className="p-3 rounded-xl text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Dengarkan">
                <Volume2 size={20} />
              </button>
              <button onClick={() => {
                const cleanText = fullscreenData.text.replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
                navigator.clipboard.writeText(cleanText);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }} className="p-3 rounded-xl text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Salin">
                {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
              </button>
              <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1 md:mx-2"></div>
              <button onClick={() => setFullscreenData(null)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 dark:bg-red-900/30 dark:hover:bg-red-900/50 transition-colors font-semibold shadow-sm" title="Tutup Layar Penuh">
                <X size={20} /> <span className="hidden md:inline font-sans">Tutup</span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-12 lg:px-24">
            <div className="max-w-4xl mx-auto pb-12">
              <div className={`text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-loose md:leading-loose text-justify ${fontStyle} ${textSize}`}>
                {renderFormattedText(fullscreenData.text)}
              </div>
              {fullscreenData.phonetic && (
                <p className="text-gray-500 dark:text-gray-400 font-mono text-lg mt-12 border-t border-gray-100 dark:border-gray-800 pt-8 text-center">
                  Cara membaca: <br/><span className="text-indigo-500 dark:text-indigo-400 font-semibold mt-2 inline-block">/{fullscreenData.phonetic}/</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}