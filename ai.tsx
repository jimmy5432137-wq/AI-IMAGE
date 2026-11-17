import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  Sun,
  Moon,
  Play,
  RotateCw,
  Download,
  Trash2,
  RefreshCw,
  X,
  SplitSquareHorizontal,
  ArrowRightLeft,
  History,
  User,
  Shirt,
  Compass,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Settings,
  Wand2,
  Sparkle,
  ShieldCheck,
  KeyRound,
  Server
} from 'lucide-react';

// ============================================================================
// ENVIRONMENT & SECURITY HELPERS (ZERO HARDCODED SECRETS)
// ============================================================================

function getEnvApiKey(): string {
  try {
    // Vite environment variable support
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> })?.env;
    if (metaEnv?.VITE_GEMINI_API_KEY) {
      return metaEnv.VITE_GEMINI_API_KEY.trim();
    }
  } catch {
    // Ignore when import.meta.env is unavailable
  }
  try {
    // CRA / Node-style fallback
    const procEnv = (globalThis as unknown as { process?: { env?: Record<string, string> } })
      ?.process?.env;
    if (procEnv?.REACT_APP_GEMINI_API_KEY) {
      return procEnv.REACT_APP_GEMINI_API_KEY.trim();
    }
  } catch {
    // Ignore
  }
  return '';
}

function getEnvBackendUrl(): string {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> })?.env;
    if (metaEnv?.VITE_BACKEND_URL) {
      return metaEnv.VITE_BACKEND_URL.replace(/\/+$/, '');
    }
  } catch {
    // Ignore
  }
  return 'http://localhost:8000';
}

function getEnvUseProxy(): boolean {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> })?.env;
    return metaEnv?.VITE_USE_BACKEND_PROXY === 'true';
  } catch {
    return false;
  }
}

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type ThemeMode = 'dark' | 'light';
type HashRoute = 'studio' | 'history' | 'settings';
type TransformMode =
  | 'pose-outfit-comp'
  | 'pose-comp-only'
  | 'outfit-only'
  | 'style-lighting';

interface ManagedImageAsset {
  blob: Blob;
  objectUrl: string;
  mimeType: string;
  width: number;
  height: number;
  suggestedRatio: string;
}

interface GeneratedRecord {
  id: string;
  timestamp: string;
  mode: TransformMode;
  prompt: string;
  aspectRatio: string;
  imageAUrl: string;
  resultBlob: Blob;
  resultUrl: string;
}

interface GenerationProgress {
  total: number;
  completed: number;
  percent: number;
  etaSeconds: number | null;
}

interface ToastNotice {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

class NonRetryableApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'NonRetryableApiError';
    this.status = status;
  }
}

const MODE_OPTIONS: Array<{
  id: TransformMode;
  title: string;
  desc: string;
}> = [
  {
    id: 'pose-outfit-comp',
    title: '姿勢 + 服裝 + 構圖全轉換',
    desc: '保留圖片 A 的人物五官，完整套用圖片 B 的動作姿勢、服裝穿搭與鏡頭構圖'
  },
  {
    id: 'pose-comp-only',
    title: '僅轉換姿勢與構圖',
    desc: '保留圖片 A 的人物臉孔與原本服裝，僅改變為圖片 B 的肢體動作與視角'
  },
  {
    id: 'outfit-only',
    title: '僅更換服裝造型',
    desc: '保留圖片 A 的人物與原本姿勢，換上圖片 B 或文字描述的服裝穿搭'
  },
  {
    id: 'style-lighting',
    title: '攝影光影與氛圍重塑',
    desc: '保留人物與基本動作，轉換為圖片 B 的攝影色調、打光與背景質感'
  }
];

const QUICK_PROMPT_TAGS = [
  '自然真實膚質，高級攝影棚柔和打光',
  '韓系時尚雜誌街拍質感，85mm 人像鏡頭',
  '修身商務正裝造型，俐落都會背景',
  '電影感自然光影，細膩布料紋理'
];

const SMART_RECIPES: Array<{
  id: string;
  label: string;
  mode: TransformMode;
  identity: number;
  poseComp: number;
  outfitStyle: number;
  prompt: string;
}> = [
  {
    id: 'fashion-editorial',
    label: '時尚街拍全轉換',
    mode: 'pose-outfit-comp',
    identity: 92,
    poseComp: 88,
    outfitStyle: 90,
    prompt: '高級時尚雜誌街拍質感，85mm 人像鏡頭景深，自然真實膚質與細膩布料垂墜感'
  },
  {
    id: 'business-portrait',
    label: '商務形象重塑',
    mode: 'pose-outfit-comp',
    identity: 95,
    poseComp: 82,
    outfitStyle: 88,
    prompt: '專業商務形象攝影，俐落剪裁正裝，柔和攝影棚主光與眼神光，自信自然神情'
  },
  {
    id: 'pose-only-keep-clothes',
    label: '原穿搭換新姿勢',
    mode: 'pose-comp-only',
    identity: 94,
    poseComp: 90,
    outfitStyle: 20,
    prompt: '完整保留圖片 A 原本服裝款式與顏色，流暢自然轉換為圖片 B 的肢體動作與構圖視角'
  },
  {
    id: 'virtual-tryon',
    label: '原姿勢精準換裝',
    mode: 'outfit-only',
    identity: 95,
    poseComp: 30,
    outfitStyle: 92,
    prompt: '保持圖片 A 人物站姿與表情不變，精準換上圖片 B 的服裝剪裁與材質，光影自然貼合'
  }
];

const QUICK_REFINE_ACTIONS = [
  '微調臉部神情更自然柔和，眼神清晰有神',
  '強化服裝布料皺褶與身體動作的物理貼合度',
  '統一臉部與場景主光源色溫，讓光影過渡更真實',
  '提升整體畫面細節銳利度與高級攝影棚質感'
];

// ============================================================================
// RESILIENT JSON PARSER & BLOB / OBJECT-URL MEMORY HELPERS
// ============================================================================

/**
 * Strips potential Markdown code fences (e.g. ```json ... ```) before parsing JSON.
 */
function safeParseJsonResponse<T = Record<string, unknown>>(rawText: string): T {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json|JSON)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error('伺服器回傳格式無法解析為有效 JSON');
  }
}

function detectClosestAspectRatio(width: number, height: number): string {
  const target = width / Math.max(1, height);
  const candidates: Array<{ label: string; value: number }> = [
    { label: '1:1', value: 1 },
    { label: '3:4', value: 3 / 4 },
    { label: '4:3', value: 4 / 3 },
    { label: '9:16', value: 9 / 16 },
    { label: '16:9', value: 16 / 9 }
  ];
  let best = candidates[0];
  let minDiff = Math.abs(target - best.value);
  for (const c of candidates) {
    const diff = Math.abs(target - c.value);
    if (diff < minDiff) {
      minDiff = diff;
      best = c;
    }
  }
  return best.label;
}

/**
 * Processes an image source (File or Blob) into a normalized JPEG Blob + ObjectURL,
 * avoiding heavy Base64 strings in React state while stripping EXIF metadata.
 */
function processSourceToBlobAsset(
  source: Blob,
  registerUrl: (url: string) => void,
  rotationDeg = 0,
  maxDim = 1024
): Promise<ManagedImageAsset> {
  return new Promise((resolve, reject) => {
    const tempInputUrl = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(tempInputUrl);
      const isSwapped = rotationDeg % 180 !== 0;
      const srcW = isSwapped ? img.naturalHeight : img.naturalWidth;
      const srcH = isSwapped ? img.naturalWidth : img.naturalHeight;
      const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
      const outW = Math.max(64, Math.round(srcW * scale));
      const outH = Math.max(64, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('無法初始化影像處理畫布'));
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.save();
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('影像壓縮轉換 Blob 失敗'));
            return;
          }
          const objectUrl = URL.createObjectURL(blob);
          registerUrl(objectUrl);
          resolve({
            blob,
            objectUrl,
            mimeType: 'image/jpeg',
            width: outW,
            height: outH,
            suggestedRatio: detectClosestAspectRatio(outW, outH)
          });
        },
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(tempInputUrl);
      reject(new Error('圖片讀取失敗，請確認檔案未損毀'));
    };
    img.src = tempInputUrl;
  });
}

/**
 * Converts a Blob to Base64 on-demand solely during network request serialization.
 */
function blobToRawBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx !== -1 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Blob 編碼失敗'));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, mimeType = 'image/png'): Blob {
  const binaryStr = atob(b64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

// ============================================================================
// HASH ROUTER HOOK (PREVENTS 404 ON GITHUB PAGES REFRESH)
// ============================================================================

function parseHashRoute(hashStr: string): HashRoute {
  const clean = hashStr.replace(/^#\/?/, '').split('?')[0].toLowerCase();
  if (clean === 'history') return 'history';
  if (clean === 'settings') return 'settings';
  return 'studio';
}

function useHashRouter(): [HashRoute, (route: HashRoute) => void] {
  const [route, setRoute] = useState<HashRoute>(() =>
    typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : 'studio'
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/studio');
    }
    const onHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((nextRoute: HashRoute) => {
    if (typeof window !== 'undefined') {
      window.location.hash = `#/${nextRoute}`;
    }
    setRoute(nextRoute);
  }, []);

  return [route, navigate];
}

// ============================================================================
// MAIN STUDIO APPLICATION
// ============================================================================

export default function App() {
  const [activeRoute, navigateRoute] = useHashRouter();
  const [theme, setTheme] = useState<ThemeMode>('dark');

  // API Security State: Environment variable, Backend Proxy, or Session-only Key
  const envKey = getEnvApiKey();
  const [useBackendProxy, setUseBackendProxy] = useState<boolean>(() => getEnvUseProxy());
  const [backendUrl, setBackendUrl] = useState<string>(() => getEnvBackendUrl());
  const [sessionApiKey, setSessionApiKey] = useState<string>(() => {
    try {
      return sessionStorage.getItem('gemini_session_key') || '';
    } catch {
      return '';
    }
  });

  // Track all created Object URLs to ensure deterministic memory cleanup
  const trackedObjectUrlsRef = useRef<Set<string>>(new Set());

  const registerObjectUrl = useCallback((url: string) => {
    trackedObjectUrlsRef.current.add(url);
  }, []);

  const revokeObjectUrlSafe = useCallback((url?: string | null) => {
    if (!url) return;
    if (trackedObjectUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      trackedObjectUrlsRef.current.delete(url);
    }
  }, []);

  // Revoke all remaining Object URLs on component unmount
  useEffect(() => {
    const registry = trackedObjectUrlsRef.current;
    return () => {
      registry.forEach((url) => URL.revokeObjectURL(url));
      registry.clear();
    };
  }, []);

  // Dual Image Assets stored as Blobs + ObjectURLs
  const [imageA, setImageA] = useState<ManagedImageAsset | null>(null);
  const [imageB, setImageB] = useState<ManagedImageAsset | null>(null);

  // Transformation Controls
  const [mode, setMode] = useState<TransformMode>('pose-outfit-comp');
  const [identityStrength, setIdentityStrength] = useState<number>(92);
  const [poseCompStrength, setPoseCompStrength] = useState<number>(85);
  const [outfitStyleStrength, setOutfitStyleStrength] = useState<number>(85);
  const [aspectRatio, setAspectRatio] = useState<string>('3:4');
  const [variations, setVariations] = useState<number>(1);
  const [userPrompt, setUserPrompt] = useState<string>(
    '自然真實膚質，高級攝影棚柔和打光，清晰五官細節，高畫質人像攝影'
  );

  // Generation & Concurrent ETA Progress State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [currentResults, setCurrentResults] = useState<GeneratedRecord[]>([]);
  const [activeResultIdx, setActiveResultIdx] = useState<number>(0);

  // Compare Slider & Lightbox State
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  // History List (Blob-backed)
  const [historyList, setHistoryList] = useState<GeneratedRecord[]>([]);

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const notify = useCallback((type: ToastNotice['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Save Session API Key helper
  const handleSaveSessionKey = (val: string) => {
    const trimmed = val.trim();
    setSessionApiKey(trimmed);
    try {
      if (trimmed) {
        sessionStorage.setItem('gemini_session_key', trimmed);
      } else {
        sessionStorage.removeItem('gemini_session_key');
      }
    } catch {
      // Ignore storage errors in restricted iframes
    }
  };

  // File Upload Handler (Blob + ObjectURL pipeline)
  const handleImageUpload = async (file: File, target: 'A' | 'B') => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      notify('error', '僅支援 JPG、PNG 或 WEBP 格式圖片');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      notify('error', '圖片檔案大小請勿超過 20MB');
      return;
    }

    try {
      const asset = await processSourceToBlobAsset(file, registerObjectUrl, 0, 1024);
      if (target === 'A') {
        setImageA((prev) => {
          revokeObjectUrlSafe(prev?.objectUrl);
          return asset;
        });
        notify('success', '已載入圖片 A（人物主角）');
      } else {
        setImageB((prev) => {
          revokeObjectUrlSafe(prev?.objectUrl);
          return asset;
        });
        setAspectRatio(asset.suggestedRatio);
        notify('success', `已載入圖片 B，並自動對齊參考構圖比例 (${asset.suggestedRatio})`);
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : '圖片處理失敗，請重新選擇檔案');
    }
  };

  const handleRotateImage = async (target: 'A' | 'B') => {
    const current = target === 'A' ? imageA : imageB;
    if (!current) return;
    try {
      const rotated = await processSourceToBlobAsset(current.blob, registerObjectUrl, 90, 1024);
      if (target === 'A') {
        setImageA((prev) => {
          revokeObjectUrlSafe(prev?.objectUrl);
          return rotated;
        });
      } else {
        setImageB((prev) => {
          revokeObjectUrlSafe(prev?.objectUrl);
          return rotated;
        });
      }
    } catch {
      notify('error', '圖片旋轉失敗');
    }
  };

  // ==========================================================================
  // RESILIENT GEMINI ENDPOINT CALLER (STATUS CLASSIFICATION + MARKDOWN PARSING)
  // ==========================================================================

  const callGeminiEndpoint = async (
    parts: Array<Record<string, unknown>>,
    ratio: string
  ): Promise<Blob> => {
    const resolvedKey = (sessionApiKey || envKey).trim();

    if (!useBackendProxy && !resolvedKey) {
      navigateRoute('settings');
      throw new NonRetryableApiError(
        401,
        '尚未設定 Gemini API 金鑰，請先於「安全與部署設定」填入或啟用後端代理模式。'
      );
    }

    const modelCandidates = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
    const payload = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: ratio
        }
      }
    };

    let lastFailureReason = '未能產生影像，請調整描述詞或更換參考圖片後再試。';

    for (const modelName of modelCandidates) {
      const targetUrl = useBackendProxy
        ? `${backendUrl}/api/v1/gemini/proxy?model=${encodeURIComponent(modelName)}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(resolvedKey)}`;

      let attempt = 0;
      const maxRetries = 2;

      while (attempt <= maxRetries) {
        let res: Response;
        try {
          res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (networkErr) {
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
            attempt++;
            continue;
          }
          throw new Error(
            networkErr instanceof Error ? `網路連線異常：${networkErr.message}` : '網路連線失敗'
          );
        }

        const rawText = await res.text();

        // 1. Non-retryable Auth / Permission Errors -> Fail fast without hanging
        if (res.status === 401 || res.status === 403) {
          throw new NonRetryableApiError(
            res.status,
            `API 金鑰驗證失敗或權限不足 (HTTP ${res.status})，請檢查金鑰設定。`
          );
        }

        // 2. Model not found on endpoint -> Immediately advance to fallback model
        if (res.status === 404) {
          lastFailureReason = `模型 ${modelName} 暫不支援，已自動切換備援模型`;
          break;
        }

        // 3. Non-retryable Bad Request (400) -> Parse error cleanly and stop
        if (res.status === 400) {
          let detail = rawText.slice(0, 140);
          try {
            const errJson = safeParseJsonResponse<{ error?: { message?: string } }>(rawText);
            if (errJson?.error?.message) detail = errJson.error.message;
          } catch {
            // Keep rawText slice
          }
          throw new NonRetryableApiError(400, `請求參數無效 (HTTP 400)：${detail}`);
        }

        // 4. Retryable Rate Limit (429) or Server Errors (5xx)
        if (res.status === 429 || res.status >= 500) {
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
            attempt++;
            continue;
          }
          throw new Error(`Gemini 服務目前繁忙 (HTTP ${res.status})，請稍後再試。`);
        }

        if (!res.ok) {
          throw new NonRetryableApiError(
            res.status,
            `Gemini 服務非預期回應 (HTTP ${res.status})`
          );
        }

        // 5. Parse response safely (handles potential Markdown wrappers)
        const data = safeParseJsonResponse<{
          candidates?: Array<{
            finishReason?: string;
            content?: {
              parts?: Array<{
                text?: string;
                inlineData?: { mimeType?: string; data?: string };
              }>;
            };
          }>;
        }>(rawText);

        const candidate = data?.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const resParts = candidate?.content?.parts || [];
        const imgPart = resParts.find((p) => p.inlineData?.data);
        const textPart = resParts.find((p) => p.text);

        if (imgPart?.inlineData?.data) {
          return base64ToBlob(
            imgPart.inlineData.data,
            imgPart.inlineData.mimeType || 'image/png'
          );
        }

        if (finishReason === 'IMAGE_OTHER') {
          lastFailureReason = '模型回傳 IMAGE_OTHER，正在自動切換備援模型重試...';
          break;
        }

        lastFailureReason = textPart?.text
          ? `模型回應：${textPart.text}`
          : `模型未回傳圖片（狀態：${finishReason || 'NO_IMAGE'}）`;
        break;
      }
    }

    throw new Error(lastFailureReason);
  };

  // ==========================================================================
  // PROMPT BUILDER (NATURAL PHOTOGRAPHY DIRECTION)
  // ==========================================================================

  const buildNaturalPhotographyPrompt = (
    hasImageB: boolean,
    variationIndex: number,
    totalVariations: number
  ): string => {
    let poseAndFramingDesc = '';
    let outfitDesc = '';

    if (mode === 'pose-outfit-comp') {
      poseAndFramingDesc = hasImageB
        ? `Adopt the body posture, limb angles, head tilt, and camera framing from the second reference photo (pose adherence ${poseCompStrength}%), while keeping only the identity and facial features of the person in the first photo.`
        : `Compose a natural, graceful editorial pose and camera framing matching the description (pose adherence ${poseCompStrength}%).`;
      outfitDesc = hasImageB
        ? `Dress the person from the first photo in the outfit style, garment cut, and color palette seen in the second photo (outfit adherence ${outfitStyleStrength}%), with realistic fabric drape.`
        : `Style the person in the outfit described below with natural fabric texture (strength ${outfitStyleStrength}%).`;
    } else if (mode === 'pose-comp-only') {
      poseAndFramingDesc = hasImageB
        ? `Transfer only the body posture, gesture, and camera framing from the second photo onto the person from the first photo (pose adherence ${poseCompStrength}%).`
        : `Adjust the person's posture and camera framing as described below.`;
      outfitDesc = `Keep the exact original outfit, clothing style, and colors worn by the person in the first photo.`;
    } else if (mode === 'outfit-only') {
      poseAndFramingDesc = `Keep the exact body posture, head angle, expression, and framing of the person in the first photo.`;
      outfitDesc = hasImageB
        ? `Replace the clothing of the person in the first photo with the outfit style and fabric texture from the second photo (outfit adherence ${outfitStyleStrength}%).`
        : `Update the person's clothing according to the description below with natural tailoring (strength ${outfitStyleStrength}%).`;
    } else {
      poseAndFramingDesc = `Preserve the person's pose and facial likeness from the first photo.`;
      outfitDesc = hasImageB
        ? `Apply the photographic lighting mood, color grading, and studio atmosphere of the second photo onto the first photo (style strength ${outfitStyleStrength}%).`
        : `Apply refined studio lighting and color grading as described below.`;
    }

    const variationNote =
      totalVariations > 1
        ? ` Create subtle natural variation #${variationIndex + 1} in micro-expression and lighting.`
        : '';

    return [
      'Create a high-resolution, photorealistic commercial fashion portrait.',
      `Preserve the natural facial features, skin tone, and identity of the person in the first photo (identity preservation ${identityStrength}%).`,
      poseAndFramingDesc,
      outfitDesc,
      'Ensure natural facial relighting so shadows and color temperature blend seamlessly with the scene.',
      userPrompt.trim() ? `Photography direction: ${userPrompt.trim()}.` : '',
      variationNote
    ]
      .filter(Boolean)
      .join(' ');
  };

  // ==========================================================================
  // CONCURRENT GENERATION (Promise.allSettled + REAL-TIME ETA PROGRESS BAR)
  // ==========================================================================

  const handleGenerate = async (forceSingleImageFallback = false) => {
    if (!imageA) {
      notify('error', '請先上傳「圖片 A（人物主角）」');
      return;
    }

    const totalCount = Math.max(1, Math.min(4, variations));
    setIsGenerating(true);
    setLastError(null);
    setCompareMode(false);
    setProgress({
      total: totalCount,
      completed: 0,
      percent: 0,
      etaSeconds: null
    });

    const startTime = performance.now();
    let completedCount = 0;

    try {
      // Encode Blobs to Base64 strictly on-demand for API transmission
      const base64A = await blobToRawBase64(imageA.blob);
      const useImageB = Boolean(imageB && !forceSingleImageFallback);
      const base64B = useImageB && imageB ? await blobToRawBase64(imageB.blob) : null;

      const tasks = Array.from({ length: totalCount }, async (_, idx): Promise<GeneratedRecord> => {
        const promptText = buildNaturalPhotographyPrompt(useImageB, idx, totalCount);
        const parts: Array<Record<string, unknown>> = [
          { text: promptText },
          { inlineData: { mimeType: imageA.mimeType, data: base64A } }
        ];

        if (base64B && imageB) {
          parts.push({ inlineData: { mimeType: imageB.mimeType, data: base64B } });
        }

        try {
          const resultBlob = await callGeminiEndpoint(parts, aspectRatio);
          const resultUrl = URL.createObjectURL(resultBlob);
          registerObjectUrl(resultUrl);

          return {
            id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            mode,
            prompt: userPrompt,
            aspectRatio,
            imageAUrl: imageA.objectUrl,
            resultBlob,
            resultUrl
          };
        } finally {
          completedCount += 1;
          const elapsedMs = performance.now() - startTime;
          const avgMsPerImage = elapsedMs / completedCount;
          const remaining = totalCount - completedCount;
          const etaSeconds =
            remaining > 0 ? Math.max(1, Math.ceil((avgMsPerImage * remaining) / 1000)) : 0;

          setProgress({
            total: totalCount,
            completed: completedCount,
            percent: Math.round((completedCount / totalCount) * 100),
            etaSeconds
          });
        }
      });

      const settledResults = await Promise.allSettled(tasks);
      const succeeded: GeneratedRecord[] = [];
      const errors: string[] = [];

      for (const item of settledResults) {
        if (item.status === 'fulfilled') {
          succeeded.push(item.value);
        } else {
          errors.push(item.reason instanceof Error ? item.reason.message : '單張生成失敗');
        }
      }

      if (succeeded.length > 0) {
        setCurrentResults(succeeded);
        setActiveResultIdx(0);
        setHistoryList((prev) => [...succeeded, ...prev]);

        if (errors.length > 0) {
          notify(
            'info',
            `已成功顯示 ${succeeded.length} 張影像（另有 ${errors.length} 張未完成：${errors[0]}）`
          );
        } else {
          notify('success', `並發生成完成，共產出 ${succeeded.length} 張轉換影像！`);
        }
      } else {
        const primaryErr = errors[0] || '所有生成任務皆未回傳影像，請調整描述詞後重試。';
        setLastError(primaryErr);
        notify('error', primaryErr);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '生成過程發生錯誤';
      setLastError(msg);
      notify('error', msg);
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  // One-click Coarse-to-Fine Iterative Refinement on the active generated image
  const handleQuickRefine = async (refineInstruction: string) => {
    const targetResult = currentResults[activeResultIdx];
    if (!targetResult || isGenerating) return;

    setIsGenerating(true);
    setLastError(null);
    setProgress({ total: 1, completed: 0, percent: 25, etaSeconds: null });

    try {
      const base64Current = await blobToRawBase64(targetResult.resultBlob);
      const base64OrigA = imageA ? await blobToRawBase64(imageA.blob) : null;

      const refinePrompt = [
        'Refine this commercial fashion portrait while keeping the exact body pose, outfit, and framing.',
        `Preserve the natural facial features and identity of the subject (identity preservation ${identityStrength}%).`,
        `Apply this specific adjustment: ${refineInstruction}.`,
        'Maintain natural skin texture, balanced lighting, and crisp photographic details.'
      ].join(' ');

      const parts: Array<Record<string, unknown>> = [
        { text: refinePrompt },
        { inlineData: { mimeType: targetResult.resultBlob.type || 'image/png', data: base64Current } }
      ];
      if (base64OrigA && imageA) {
        parts.push({ inlineData: { mimeType: imageA.mimeType, data: base64OrigA } });
      }

      const refinedBlob = await callGeminiEndpoint(parts, targetResult.aspectRatio);
      const refinedUrl = URL.createObjectURL(refinedBlob);
      registerObjectUrl(refinedUrl);

      const refinedRecord: GeneratedRecord = {
        ...targetResult,
        id: `${Date.now()}-refined`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        prompt: `${targetResult.prompt}（微調：${refineInstruction}）`,
        resultBlob: refinedBlob,
        resultUrl: refinedUrl
      };

      setProgress({ total: 1, completed: 1, percent: 100, etaSeconds: 0 });
      setCurrentResults((prev) => [refinedRecord, ...prev]);
      setActiveResultIdx(0);
      setHistoryList((prev) => [refinedRecord, ...prev]);
      notify('success', '已完成細節微調精修！');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '微調過程發生錯誤';
      setLastError(msg);
      notify('error', msg);
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  const activeResult = currentResults[activeResultIdx] || null;
  const isDark = theme === 'dark';
  const hasConfiguredAuth = useBackendProxy || Boolean(sessionApiKey || envKey);

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors ${
        isDark ? 'bg-[#0C0E14] text-zinc-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* ====================================================================
          TOP NAVIGATION BAR (HASH ROUTER FOR GITHUB PAGES)
         ==================================================================== */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md px-4 sm:px-6 h-14 flex items-center justify-between ${
          isDark ? 'bg-[#0C0E14]/90 border-zinc-800/80' : 'bg-white/90 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigateRoute('studio')}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="text-sm sm:text-base font-bold tracking-tight">
              AI 姿勢與服裝構圖轉換工作站
            </h1>
          </button>

          <nav className="hidden md:flex items-center gap-1 ml-3">
            {[
              { id: 'studio' as HashRoute, label: '轉換工作台' },
              { id: 'history' as HashRoute, label: `歷史紀錄 (${historyList.length})` },
              { id: 'settings' as HashRoute, label: '安全與部署設定' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigateRoute(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeRoute === tab.id
                    ? 'bg-indigo-600 text-white'
                    : isDark
                      ? 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateRoute('settings')}
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              hasConfiguredAuth
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasConfiguredAuth ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {useBackendProxy
              ? '後端代理安全模式'
              : hasConfiguredAuth
                ? '環境/工作階段金鑰就緒'
                : '請設定 API 金鑰'}
          </button>

          <button
            type="button"
            onClick={() => navigateRoute(activeRoute === 'history' ? 'studio' : 'history')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition ${
              isDark
                ? 'bg-zinc-900 border-zinc-800 hover:border-indigo-500'
                : 'bg-white border-slate-200 hover:border-indigo-500'
            }`}
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <span>歷史紀錄</span>
            {historyList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px]">
                {historyList.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => navigateRoute(activeRoute === 'settings' ? 'studio' : 'settings')}
            title="安全與 API 設定"
            className={`p-2 rounded-xl border transition ${
              activeRoute === 'settings'
                ? 'border-indigo-500 text-indigo-400'
                : isDark
                  ? 'bg-zinc-900 border-zinc-800 hover:border-indigo-500 text-zinc-400'
                  : 'bg-white border-slate-200 hover:border-indigo-500 text-slate-600'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title="切換深淺色主題"
            className={`p-2 rounded-xl border transition ${
              isDark
                ? 'bg-zinc-900 border-zinc-800 hover:border-indigo-500'
                : 'bg-white border-slate-200 hover:border-indigo-500'
            }`}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ====================================================================
          ROUTE 1: STUDIO WORKSPACE (#/studio)
         ==================================================================== */}
      {activeRoute === 'studio' && (
        <main className="flex-1 max-w-[1480px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: INPUTS & CONTROLS (6 cols) */}
          <div className="lg:col-span-6 space-y-5">
            {/* STEP 1: DUAL IMAGE UPLOAD CARDS */}
            <section
              className={`p-4 sm:p-5 rounded-2xl border space-y-4 ${
                isDark ? 'bg-[#131620] border-zinc-800/90' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">
                    1
                  </span>
                  上傳雙圖參照（Blob 記憶體優化管線）
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* IMAGE A CARD */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-indigo-400">
                      <User className="w-3.5 h-3.5" />
                      圖片 A：人物主角（必填）
                    </span>
                    {imageA && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleRotateImage('A')}
                          title="旋轉 90°"
                          className="p-1 rounded hover:bg-zinc-700/40"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setImageA((prev) => {
                              revokeObjectUrlSafe(prev?.objectUrl);
                              return null;
                            })
                          }
                          title="移除圖片並釋放記憶體"
                          className="p-1 rounded text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {!imageA ? (
                    <label
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleImageUpload(f, 'A');
                      }}
                      className={`h-56 rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-4 text-center cursor-pointer transition ${
                        isDark
                          ? 'border-zinc-700 hover:border-indigo-500 bg-zinc-900/50'
                          : 'border-slate-300 hover:border-indigo-500 bg-slate-50'
                      }`}
                    >
                      <Upload className="w-7 h-7 text-indigo-400 mb-2" />
                      <span className="text-xs font-semibold">點擊或拖曳上傳人物照片</span>
                      <span className="text-[11px] text-zinc-500 mt-1">保留此人物的臉部五官特徵</span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f, 'A');
                        }}
                      />
                    </label>
                  ) : (
                    <div className="relative h-56 rounded-xl overflow-hidden bg-black/80 border border-zinc-800 flex items-center justify-center">
                      <img
                        src={imageA.objectUrl}
                        alt="圖片 A 主角"
                        className="max-h-full max-w-full object-contain"
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-zinc-300">
                        {imageA.width}×{imageA.height}
                      </span>
                      <label className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/75 hover:bg-indigo-600 text-white text-[11px] font-medium cursor-pointer transition">
                        更換照片
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleImageUpload(f, 'A');
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* IMAGE B CARD */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-violet-400">
                      <Shirt className="w-3.5 h-3.5" />
                      圖片 B：姿勢 / 服裝參考
                    </span>
                    {imageB && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleRotateImage('B')}
                          title="旋轉 90°"
                          className="p-1 rounded hover:bg-zinc-700/40"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setImageB((prev) => {
                              revokeObjectUrlSafe(prev?.objectUrl);
                              return null;
                            })
                          }
                          title="移除圖片並釋放記憶體"
                          className="p-1 rounded text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {!imageB ? (
                    <label
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleImageUpload(f, 'B');
                      }}
                      className={`h-56 rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-4 text-center cursor-pointer transition ${
                        isDark
                          ? 'border-zinc-700 hover:border-violet-500 bg-zinc-900/50'
                          : 'border-slate-300 hover:border-violet-500 bg-slate-50'
                      }`}
                    >
                      <Compass className="w-7 h-7 text-violet-400 mb-2" />
                      <span className="text-xs font-semibold">上傳姿勢 / 穿搭 / 構圖參考圖</span>
                      <span className="text-[11px] text-zinc-500 mt-1">
                        選填（亦可直接用下方文字描述）
                      </span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f, 'B');
                        }}
                      />
                    </label>
                  ) : (
                    <div className="relative h-56 rounded-xl overflow-hidden bg-black/80 border border-zinc-800 flex items-center justify-center">
                      <img
                        src={imageB.objectUrl}
                        alt="圖片 B 參考"
                        className="max-h-full max-w-full object-contain"
                      />
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-violet-300">
                        參考比例 {imageB.suggestedRatio}
                      </span>
                      <label className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/75 hover:bg-violet-600 text-white text-[11px] font-medium cursor-pointer transition">
                        更換參考圖
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleImageUpload(f, 'B');
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* STEP 2: TRANSFORMATION MODE & SLIDERS */}
            <section
              className={`p-4 sm:p-5 rounded-2xl border space-y-4 ${
                isDark ? 'bg-[#131620] border-zinc-800/90' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">
                    2
                  </span>
                  選擇轉換方式與微調強度
                </h2>

                <div className="flex flex-wrap items-center gap-1">
                  {SMART_RECIPES.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => {
                        setMode(rec.mode);
                        setIdentityStrength(rec.identity);
                        setPoseCompStrength(rec.poseComp);
                        setOutfitStyleStrength(rec.outfitStyle);
                        setUserPrompt(rec.prompt);
                        notify('info', `已套用「${rec.label}」最佳化參數配方`);
                      }}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1 transition ${
                        isDark
                          ? 'bg-zinc-900 border-zinc-800 text-indigo-300 hover:border-indigo-500'
                          : 'bg-indigo-50/70 border-indigo-200 text-indigo-700 hover:border-indigo-400'
                      }`}
                    >
                      <Wand2 className="w-3 h-3" />
                      <span>{rec.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4 Clean Mode Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {MODE_OPTIONS.map((opt) => {
                  const selected = mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMode(opt.id)}
                      className={`p-3 rounded-xl border text-left transition ${
                        selected
                          ? 'border-indigo-500 bg-indigo-500/15 ring-1 ring-indigo-500/40'
                          : isDark
                            ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold">{opt.title}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* 3 Clear Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div
                  className={`p-3 rounded-xl border ${
                    isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span>五官保留度</span>
                    <span className="font-mono text-indigo-400">{identityStrength}%</span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    value={identityStrength}
                    onChange={(e) => setIdentityStrength(Number(e.target.value))}
                    className="w-full h-1.5 accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span>姿勢構圖跟隨</span>
                    <span className="font-mono text-violet-400">{poseCompStrength}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={poseCompStrength}
                    onChange={(e) => setPoseCompStrength(Number(e.target.value))}
                    className="w-full h-1.5 accent-violet-500 cursor-pointer"
                  />
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span>服裝造型轉換</span>
                    <span className="font-mono text-emerald-400">{outfitStyleStrength}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={outfitStyleStrength}
                    onChange={(e) => setOutfitStyleStrength(Number(e.target.value))}
                    className="w-full h-1.5 accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Aspect Ratio & Concurrent Variations (1-4) */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-400 mr-1">畫面比例：</span>
                  {['3:4', '1:1', '4:3', '9:16', '16:9'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setAspectRatio(r)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition ${
                        aspectRatio === r
                          ? 'bg-indigo-600 text-white'
                          : isDark
                            ? 'bg-zinc-900 text-zinc-400 hover:text-white'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-400">並發張數：</span>
                  {[1, 2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setVariations(num)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                        variations === num
                          ? 'bg-indigo-600 text-white'
                          : isDark
                            ? 'bg-zinc-900 text-zinc-400'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {num} 張
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Box + Quick Chips */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-400">
                  補充服裝、姿勢或光影描述（可自由修改）
                </label>
                <textarea
                  rows={2}
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="例如：換上米白色亞麻西裝外套，自然微笑，柔和窗光..."
                  className={`w-full p-3 rounded-xl border text-xs outline-none focus:border-indigo-500 ${
                    isDark ? 'bg-zinc-900/70 border-zinc-800' : 'bg-slate-50 border-slate-200'
                  }`}
                />
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPT_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setUserPrompt((prev) => (prev.includes(tag) ? prev : `${prev}，${tag}`))
                      }
                      className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                        isDark
                          ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-indigo-500 hover:text-indigo-300'
                          : 'bg-slate-100 border-slate-200 text-slate-600 hover:border-indigo-500'
                      }`}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* REAL-TIME CONCURRENT ETA PROGRESS BAR */}
              {isGenerating && progress && (
                <div
                  className={`p-3.5 rounded-xl border space-y-2 ${
                    isDark ? 'bg-zinc-900/90 border-indigo-500/40' : 'bg-indigo-50 border-indigo-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-indigo-400">
                      並發生成進度：{progress.completed} / {progress.total} 張 ({progress.percent}%)
                    </span>
                    <span className="font-mono text-zinc-400">
                      {progress.etaSeconds === null
                        ? '正在計算預估時間...'
                        : progress.etaSeconds > 0
                          ? `預估剩餘約 ${progress.etaSeconds} 秒`
                          : '即將完成...'}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      style={{ width: `${Math.max(8, progress.percent)}%` }}
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                    />
                  </div>
                </div>
              )}

              {/* MAIN GENERATE CTA */}
              <button
                type="button"
                disabled={isGenerating || !imageA}
                onClick={() => handleGenerate(false)}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-45 text-white shadow-lg shadow-indigo-600/25 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在並發合成影像中...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>開始並發轉換生成（{variations} 張）</span>
                  </>
                )}
              </button>
            </section>
          </div>

          {/* RIGHT COLUMN: LARGE RESULT PREVIEW & SPLIT COMPARISON (6 cols) */}
          <div className="lg:col-span-6 flex flex-col">
            <section
              className={`flex-1 p-4 sm:p-5 rounded-2xl border flex flex-col justify-between space-y-4 ${
                isDark ? 'bg-[#131620] border-zinc-800/90' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  生成結果預覽
                </h2>

                {activeResult && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCompareMode((v) => !v)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition ${
                        compareMode
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : isDark
                            ? 'bg-zinc-900 border-zinc-800 hover:border-indigo-500'
                            : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      <SplitSquareHorizontal className="w-3.5 h-3.5" />
                      <span>{compareMode ? '關閉原圖對比' : '滑動對比原圖'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setZoomImageUrl(activeResult.resultUrl)}
                      title="放大檢視"
                      className={`p-1.5 rounded-lg border ${
                        isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* ERROR BANNER WITH ONE-CLICK SINGLE-IMAGE RESCUE */}
              {lastError && !isGenerating && (
                <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-2.5">
                  <div className="flex items-start gap-2 text-xs text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <div className="font-bold">生成提示：{lastError}</div>
                      <p className="text-amber-200/80 mt-1 leading-relaxed">
                        若參考圖 B 包含受保護影像或公眾人物可能導致服務端攔截，您可改用「僅圖片 A + 文字描述」繼續生成。
                      </p>
                    </div>
                  </div>
                  {imageA && imageB && (
                    <button
                      type="button"
                      onClick={() => handleGenerate(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition"
                    >
                      改用「僅圖片 A + 文字描述」一鍵重試
                    </button>
                  )}
                </div>
              )}

              {/* LARGE VIEWPORT */}
              {!activeResult ? (
                <div
                  className={`flex-1 min-h-[420px] rounded-xl border border-dashed flex flex-col items-center justify-center p-8 text-center ${
                    isDark ? 'border-zinc-800 bg-zinc-950/40' : 'border-slate-300 bg-slate-50'
                  }`}
                >
                  <ImageIcon className="w-12 h-12 text-zinc-600 mb-3" />
                  <div className="text-sm font-semibold">轉換後的影像將顯示於此</div>
                  <p className="text-xs text-zinc-500 mt-1.5 max-w-xs leading-relaxed">
                    左側上傳「圖片 A（人物主角）」與「圖片 B（姿勢/服裝參考）」，點擊「開始並發轉換生成」即可獲得高畫質合成結果。
                  </p>
                </div>
              ) : (
                <div className="space-y-3 flex-1 flex flex-col">
                  <div className="relative flex-1 min-h-[420px] rounded-xl overflow-hidden bg-black flex items-center justify-center select-none border border-zinc-800">
                    <img
                      src={activeResult.resultUrl}
                      alt="生成結果"
                      className="max-h-[540px] max-w-full object-contain"
                    />

                    {/* Before / After Split Overlay */}
                    {compareMode && (
                      <>
                        <div
                          style={{ clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }}
                          className="absolute inset-0 flex items-center justify-center bg-black"
                        >
                          <img
                            src={activeResult.imageAUrl}
                            alt="原始人物"
                            className="max-h-[540px] max-w-full object-contain"
                          />
                        </div>
                        <div
                          style={{ left: `${splitPercent}%` }}
                          className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.9)] pointer-events-none"
                        />
                        <span className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/75 text-[11px] text-white">
                          原始圖片 A
                        </span>
                        <span className="absolute top-3 right-3 px-2 py-0.5 rounded bg-indigo-600/90 text-[11px] text-white">
                          轉換結果
                        </span>
                      </>
                    )}
                  </div>

                  {compareMode && (
                    <div className="flex items-center gap-3 px-1">
                      <span className="text-xs text-zinc-400">對比滑桿</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={splitPercent}
                        onChange={(e) => setSplitPercent(Number(e.target.value))}
                        className="flex-1 accent-indigo-500"
                      />
                      <span className="text-xs font-mono w-9">{splitPercent}%</span>
                    </div>
                  )}

                  {/* Variation Switcher (1-4 concurrent results) */}
                  {currentResults.length > 1 && (
                    <div className="flex items-center gap-2">
                      {currentResults.map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveResultIdx(idx)}
                          className={`relative w-16 h-20 rounded-lg overflow-hidden border-2 transition ${
                            activeResultIdx === idx
                              ? 'border-indigo-500 scale-105'
                              : 'border-transparent opacity-60 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={item.resultUrl}
                            alt={`版本 ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Result Quick Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={activeResult.resultUrl}
                      download={`gemini-transform-${Date.now()}.png`}
                      className="flex-1 min-w-[130px] py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      <span>下載高清圖片</span>
                    </a>

                    <button
                      type="button"
                      onClick={async () => {
                        const promoted = await processSourceToBlobAsset(
                          activeResult.resultBlob,
                          registerObjectUrl,
                          0,
                          1024
                        );
                        setImageA((prev) => {
                          revokeObjectUrlSafe(prev?.objectUrl);
                          return promoted;
                        });
                        notify('info', '已設為新的「圖片 A」，可繼續進行下一輪換裝或換姿勢');
                      }}
                      className={`py-2.5 px-4 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                        isDark
                          ? 'bg-zinc-900 border-zinc-700 hover:border-indigo-500'
                          : 'bg-slate-100 border-slate-300 hover:border-indigo-500'
                      }`}
                    >
                      <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
                      <span>設為圖片 A 繼續轉換</span>
                    </button>
                  </div>

                  {/* One-Click Coarse-to-Fine Iterative Refinement Bar */}
                  <div
                    className={`p-3 rounded-xl border space-y-2 ${
                      isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                      <Sparkle className="w-3.5 h-3.5 text-indigo-400" />
                      <span>一鍵細節精修（保留當前姿勢與服裝，僅微調指定細節）：</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_REFINE_ACTIONS.map((action) => (
                        <button
                          key={action}
                          type="button"
                          disabled={isGenerating}
                          onClick={() => handleQuickRefine(action)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] border transition disabled:opacity-45 ${
                            isDark
                              ? 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-indigo-500 hover:text-indigo-300'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-500'
                          }`}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      )}

      {/* ====================================================================
          ROUTE 2: GENERATION HISTORY GALLERY (#/history)
         ==================================================================== */}
      {activeRoute === 'history' && (
        <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">本次工作階段生成紀錄（{historyList.length}）</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                所有紀錄皆以二進位 Blob 與 ObjectURL 管理，關閉分頁時自動釋放記憶體。
              </p>
            </div>
            <div className="flex items-center gap-2">
              {historyList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    historyList.forEach((item) => revokeObjectUrlSafe(item.resultUrl));
                    setHistoryList([]);
                    setCurrentResults([]);
                    notify('info', '已清空所有歷史紀錄並釋放 Blob 記憶體');
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                >
                  清空並釋放記憶體
                </button>
              )}
              <button
                type="button"
                onClick={() => navigateRoute('studio')}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white"
              >
                返回轉換工作台
              </button>
            </div>
          </div>

          {historyList.length === 0 ? (
            <div
              className={`p-16 rounded-2xl border border-dashed text-center text-xs text-zinc-500 ${
                isDark ? 'border-zinc-800 bg-[#131620]' : 'border-slate-300 bg-white'
              }`}
            >
              尚無生成紀錄，請返回轉換工作台開始創作。
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {historyList.map((rec) => (
                <div
                  key={rec.id}
                  className={`p-3 rounded-2xl border flex flex-col justify-between space-y-3 ${
                    isDark ? 'bg-[#131620] border-zinc-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="aspect-[3/4] rounded-xl overflow-hidden bg-black">
                    <img
                      src={rec.resultUrl}
                      alt="歷史生成結果"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>{rec.timestamp}</span>
                      <span className="font-mono">{rec.aspectRatio}</span>
                    </div>
                    <p className="text-xs line-clamp-2">{rec.prompt}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentResults([rec]);
                          setActiveResultIdx(0);
                          navigateRoute('studio');
                        }}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white"
                      >
                        載入檢視
                      </button>
                      <a
                        href={rec.resultUrl}
                        download={`history-${rec.id}.png`}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-zinc-700"
                      >
                        下載
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* ====================================================================
          ROUTE 3: API SECURITY & GITHUB PAGES SETTINGS (#/settings)
         ==================================================================== */}
      {activeRoute === 'settings' && (
        <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              API 安全性與部署設定
            </h2>
            <button
              type="button"
              onClick={() => navigateRoute('studio')}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white"
            >
              完成並返回工作台
            </button>
          </div>

          {/* Connection Mode Card */}
          <section
            className={`p-5 rounded-2xl border space-y-4 ${
              isDark ? 'bg-[#131620] border-zinc-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="space-y-1">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-400" />
                1. API 連線架構模式
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                程式碼已完全移除硬編碼金鑰。您可選擇透過 FastAPI 後端安全代理呼叫，或在純前端靜態部署（如 GitHub Pages）時使用環境變數或工作階段金鑰。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setUseBackendProxy(true)}
                className={`p-3.5 rounded-xl border text-left transition ${
                  useBackendProxy
                    ? 'border-indigo-500 bg-indigo-500/15'
                    : isDark
                      ? 'bg-zinc-900/60 border-zinc-800'
                      : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="text-xs font-bold">後端安全代理模式（推薦生產環境）</div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  請求發送至 FastAPI 後端，私鑰完全保留於伺服器端環境變數中。
                </div>
              </button>

              <button
                type="button"
                onClick={() => setUseBackendProxy(false)}
                className={`p-3.5 rounded-xl border text-left transition ${
                  !useBackendProxy
                    ? 'border-indigo-500 bg-indigo-500/15'
                    : isDark
                      ? 'bg-zinc-900/60 border-zinc-800'
                      : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="text-xs font-bold">靜態前端直連模式（GitHub Pages）</div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  讀取建置期環境變數或下方暫存於瀏覽器 SessionStorage 的金鑰。
                </div>
              </button>
            </div>

            {useBackendProxy ? (
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-semibold text-zinc-400">
                  FastAPI 後端代理伺服器位址
                </label>
                <input
                  type="text"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  placeholder="http://localhost:8000"
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none ${
                    isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                    Gemini API 金鑰（僅存於當前分頁 SessionStorage）
                  </label>
                  {envKey && (
                    <span className="text-[11px] text-emerald-400">
                      已偵測到環境變數 VITE_GEMINI_API_KEY
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={sessionApiKey}
                  onChange={(e) => handleSaveSessionKey(e.target.value)}
                  placeholder={
                    envKey
                      ? '已套用環境變數金鑰（亦可在此輸入覆蓋）'
                      : '請貼上您的 Google Gemini API Key...'
                  }
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-slate-50 border-slate-300'
                  }`}
                />
                <p className="text-[11px] text-zinc-500">
                  關閉瀏覽器分頁後系統會自動清除暫存金鑰，絕不會寫入網頁原始碼或版本控制庫。
                </p>
              </div>
            )}
          </section>
        </main>
      )}

      {/* ====================================================================
          FULLSCREEN LIGHTBOX MODAL
         ==================================================================== */}
      {zoomImageUrl && (
        <div
          onClick={() => setZoomImageUrl(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={zoomImageUrl}
            alt="放大檢視"
            className="max-h-[92vh] max-w-[92vw] object-contain rounded-xl"
          />
        </div>
      )}

      {/* ====================================================================
          TOAST NOTIFICATIONS
         ==================================================================== */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-xs w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-3.5 py-2.5 rounded-xl border shadow-lg text-xs flex items-center gap-2 ${
              t.type === 'error'
                ? 'bg-rose-950/95 border-rose-500/50 text-rose-100'
                : t.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100'
                  : 'bg-zinc-900/95 border-zinc-700 text-zinc-100'
            }`}
          >
            {t.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}