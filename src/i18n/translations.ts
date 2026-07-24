export type Locale = "ko" | "en" | "ja" | "zh";

export const LOCALES: Array<{ code: Locale; label: string }> = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

const ko = {
  "start.touch": "화면을 터치해주세요",
  "start.hint": "화면 아무 곳이나 터치하여 시작하세요",
  "start.waiting": "● 대기중 ●",

  "payment.title": "결제",
  "payment.selectQuantity": "결제를 완료해 주세요",
  "payment.sheets": "{count}장",
  "payment.amount": "{amount}원",
  "payment.manualGuide": "결제 후 아래 버튼을 눌러주세요",
  "payment.confirm": "결제 확인",
  "payment.cardGuide": "카드 결제를 진행해 주세요",
  "payment.pay": "결제하기",
  "payment.requesting": "결제 요청 중...",
  "payment.waiting": "결제 대기중",
  "payment.tapCard": "카드를 리더기에 대주세요",
  "payment.done": "결제 완료!",
  "payment.timeout": "결제 시간이 초과되었습니다",
  "payment.requestFailed": "결제 요청 실패",
  "payment.serverError": "서버에 연결할 수 없습니다",

  "frame.title": "컷을 선택해 주세요",
  "frame.cut": "{n}컷",

  "bg.title": "배경을 선택해 주세요",

  "printbg.title": "프레임을 선택해 주세요",

  "camera.title": "촬영",
  "camera.shoot": "촬영하기",
  "camera.sticker": "스티커 추가",
  "camera.bgChange": "배경 변경이 가능해요!",
  "camera.stickerPrompt": "스티커를 추가해 보세요!",
  "camera.remaining": "남은 촬영 횟수 {n}",
  "camera.stickerEmoji": "이모지",
  "camera.stickerImage": "이미지",
  "camera.noStickers": "업로드된 스티커가 없습니다",
  "camera.clearStickers": "전체 삭제",
  "camera.aiLoading": "AI 모델 로딩 중...",
  "camera.aiError": "AI 모델 로드 실패",
  "camera.errPermission": "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.",
  "camera.errNotFound": "연결된 카메라가 없습니다.",
  "camera.errBusy": "카메라가 다른 프로그램에서 사용 중입니다. 잠시 후 다시 시도하세요.",
  "camera.errGeneric": "카메라를 사용할 수 없습니다 ({reason})",

  "select.title": "인화할 사진을 선택해 주세요",
  "select.count": "{req}장을 선택해 주세요 ({sel}/{req})",
  "select.reshoot": "다시 촬영",

  "complete.compositing": "사진 합성 중...",
  "complete.ready": "QR 스캔 후 인화하기를 터치해주세요",
  "complete.done": "완료!",
  "complete.photoDl": "사진 다운로드",
  "complete.gifDl": "GIF 다운로드",
  "complete.qrScan": "QR 스캔",
  "complete.expiry": "{date} 까지 다운로드 가능",
  "complete.print": "인쇄하기",
  "complete.printing": "인쇄 중...",
  "complete.printDone": "인쇄가 완료되었습니다",
  "complete.printError": "인쇄 중 오류가 발생했습니다",
  "complete.restart": "처음으로 돌아가기",

  "page.saving": "사진 저장 중...",

  "common.prev": "이전으로",
  "common.next": "다음으로",
  "common.home": "처음으로",
  "common.retry": "다시 시도",
};

export type MessageKey = keyof typeof ko;

const en: Record<MessageKey, string> = {
  "start.touch": "Touch the screen",
  "start.hint": "Touch anywhere on the screen to start",
  "start.waiting": "● Waiting ●",

  "payment.title": "Payment",
  "payment.selectQuantity": "Please complete your payment",
  "payment.sheets": "{count} prints",
  "payment.amount": "₩{amount}",
  "payment.manualGuide": "After paying, press the button below",
  "payment.confirm": "Confirm Payment",
  "payment.cardGuide": "Please proceed with card payment",
  "payment.pay": "Pay",
  "payment.requesting": "Requesting payment...",
  "payment.waiting": "Waiting for payment",
  "payment.tapCard": "Please tap your card on the reader",
  "payment.done": "Payment complete!",
  "payment.timeout": "Payment timed out",
  "payment.requestFailed": "Payment request failed",
  "payment.serverError": "Cannot connect to the server",

  "frame.title": "Please select the number of cuts",
  "frame.cut": "{n}-Cut",

  "bg.title": "Please select a background",

  "printbg.title": "Please select a frame",

  "camera.title": "Capture",
  "camera.shoot": "Take Photo",
  "camera.sticker": "Add Sticker",
  "camera.bgChange": "You can change the background!",
  "camera.stickerPrompt": "Try adding stickers!",
  "camera.remaining": "Shots left: {n}",
  "camera.stickerEmoji": "Emoji",
  "camera.stickerImage": "Image",
  "camera.noStickers": "No stickers uploaded",
  "camera.clearStickers": "Clear All",
  "camera.aiLoading": "Loading AI model...",
  "camera.aiError": "Failed to load AI model",
  "camera.errPermission": "Camera permission denied. Please allow it in browser settings.",
  "camera.errNotFound": "No camera connected.",
  "camera.errBusy": "The camera is in use by another program. Please try again shortly.",
  "camera.errGeneric": "Camera unavailable ({reason})",

  "select.title": "Select photos to print",
  "select.count": "Please select {req} ({sel}/{req})",
  "select.reshoot": "Retake",

  "complete.compositing": "Creating your photo...",
  "complete.ready": "Scan the QR, then tap Print",
  "complete.done": "Done!",
  "complete.photoDl": "Photo Download",
  "complete.gifDl": "GIF Download",
  "complete.qrScan": "Scan QR",
  "complete.expiry": "Available until {date}",
  "complete.print": "Print",
  "complete.printing": "Printing...",
  "complete.printDone": "Printing complete",
  "complete.printError": "A printing error occurred",
  "complete.restart": "Back to Start",

  "page.saving": "Saving photos...",

  "common.prev": "Back",
  "common.next": "Next",
  "common.home": "Start Over",
  "common.retry": "Retry",
};

const ja: Record<MessageKey, string> = {
  "start.touch": "画面をタッチしてください",
  "start.hint": "画面のどこでもタッチして開始できます",
  "start.waiting": "● 待機中 ●",

  "payment.title": "決済",
  "payment.selectQuantity": "決済を完了してください",
  "payment.sheets": "{count}枚",
  "payment.amount": "₩{amount}",
  "payment.manualGuide": "お支払い後、下のボタンを押してください",
  "payment.confirm": "決済確認",
  "payment.cardGuide": "カード決済を行ってください",
  "payment.pay": "決済する",
  "payment.requesting": "決済リクエスト中...",
  "payment.waiting": "決済待機中",
  "payment.tapCard": "カードをリーダーにかざしてください",
  "payment.done": "決済完了！",
  "payment.timeout": "決済がタイムアウトしました",
  "payment.requestFailed": "決済リクエストに失敗しました",
  "payment.serverError": "サーバーに接続できません",

  "frame.title": "カット数を選択してください",
  "frame.cut": "{n}カット",

  "bg.title": "背景を選択してください",

  "printbg.title": "フレームを選択してください",

  "camera.title": "撮影",
  "camera.shoot": "撮影する",
  "camera.sticker": "ステッカー追加",
  "camera.bgChange": "背景を変更できます！",
  "camera.stickerPrompt": "ステッカーを追加してみましょう！",
  "camera.remaining": "残り撮影回数 {n}",
  "camera.stickerEmoji": "絵文字",
  "camera.stickerImage": "画像",
  "camera.noStickers": "アップロードされたステッカーがありません",
  "camera.clearStickers": "すべて削除",
  "camera.aiLoading": "AIモデルを読み込み中...",
  "camera.aiError": "AIモデルの読み込みに失敗しました",
  "camera.errPermission": "カメラの権限が拒否されました。ブラウザ設定で許可してください。",
  "camera.errNotFound": "接続されたカメラがありません。",
  "camera.errBusy": "カメラが他のプログラムで使用中です。しばらくしてから再試行してください。",
  "camera.errGeneric": "カメラを使用できません ({reason})",

  "select.title": "プリントする写真を選択してください",
  "select.count": "{req}枚選択してください ({sel}/{req})",
  "select.reshoot": "撮り直す",

  "complete.compositing": "写真を合成中...",
  "complete.ready": "QRスキャン後、印刷をタップしてください",
  "complete.done": "完了！",
  "complete.photoDl": "写真ダウンロード",
  "complete.gifDl": "GIFダウンロード",
  "complete.qrScan": "QRスキャン",
  "complete.expiry": "{date} までダウンロード可能",
  "complete.print": "印刷する",
  "complete.printing": "印刷中...",
  "complete.printDone": "印刷が完了しました",
  "complete.printError": "印刷中にエラーが発生しました",
  "complete.restart": "最初に戻る",

  "page.saving": "写真を保存中...",

  "common.prev": "戻る",
  "common.next": "次へ",
  "common.home": "最初へ",
  "common.retry": "再試行",
};

const zh: Record<MessageKey, string> = {
  "start.touch": "请触摸屏幕",
  "start.hint": "触摸屏幕任意位置即可开始",
  "start.waiting": "● 待机中 ●",

  "payment.title": "支付",
  "payment.selectQuantity": "请完成支付",
  "payment.sheets": "{count}张",
  "payment.amount": "₩{amount}",
  "payment.manualGuide": "付款后请按下方按钮",
  "payment.confirm": "确认支付",
  "payment.cardGuide": "请使用银行卡支付",
  "payment.pay": "支付",
  "payment.requesting": "正在请求支付...",
  "payment.waiting": "等待支付",
  "payment.tapCard": "请将卡片靠近读卡器",
  "payment.done": "支付完成！",
  "payment.timeout": "支付超时",
  "payment.requestFailed": "支付请求失败",
  "payment.serverError": "无法连接服务器",

  "frame.title": "请选择格数",
  "frame.cut": "{n}格",

  "bg.title": "请选择背景",

  "printbg.title": "请选择相框",

  "camera.title": "拍摄",
  "camera.shoot": "拍照",
  "camera.sticker": "添加贴纸",
  "camera.bgChange": "可以更换背景！",
  "camera.stickerPrompt": "试着添加贴纸吧！",
  "camera.remaining": "剩余拍摄次数 {n}",
  "camera.stickerEmoji": "表情",
  "camera.stickerImage": "图片",
  "camera.noStickers": "没有已上传的贴纸",
  "camera.clearStickers": "全部删除",
  "camera.aiLoading": "正在加载AI模型...",
  "camera.aiError": "AI模型加载失败",
  "camera.errPermission": "摄像头权限被拒绝，请在浏览器设置中允许。",
  "camera.errNotFound": "未连接摄像头。",
  "camera.errBusy": "摄像头正被其他程序使用，请稍后重试。",
  "camera.errGeneric": "无法使用摄像头 ({reason})",

  "select.title": "请选择要打印的照片",
  "select.count": "请选择{req}张 ({sel}/{req})",
  "select.reshoot": "重新拍摄",

  "complete.compositing": "正在合成照片...",
  "complete.ready": "扫描二维码后点击打印",
  "complete.done": "完成！",
  "complete.photoDl": "下载照片",
  "complete.gifDl": "下载GIF",
  "complete.qrScan": "扫描二维码",
  "complete.expiry": "可下载至 {date}",
  "complete.print": "打印",
  "complete.printing": "打印中...",
  "complete.printDone": "打印完成",
  "complete.printError": "打印时发生错误",
  "complete.restart": "返回首页",

  "page.saving": "正在保存照片...",

  "common.prev": "上一步",
  "common.next": "下一步",
  "common.home": "返回首页",
  "common.retry": "重试",
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { ko, en, ja, zh };

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  let msg = MESSAGES[locale][key] ?? MESSAGES.ko[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
  }
  return msg;
}
