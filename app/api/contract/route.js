/**
 * GET /api/contract?reservationId=xxx&locale=ja
 * 予約ごとの電子契約書（レンタル契約書）を HTML で返す。
 * 利用者・オーナー双方がこのURLから表示／印刷／PDF保存できる。
 * ?download=1 を付けると添付ダウンロードになる。
 */
import { supabaseAdmin } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const yen = (n) => `¥${Number(n || 0).toLocaleString()}`;
const dt = (s) => { try { return new Date(s).toLocaleString(); } catch { return esc(s); } };

const L = {
  ja: {
    title: 'レンタル契約書', sub: 'BEST Car Rental 電子契約書', no: '契約番号',
    parties: '当事者', lessor: '貸主（オーナー／運営）', lessee: '借主（利用者）',
    vehicle: '車両', period: '利用期間', pickup: '貸出', ret: '返却', from: '貸出場所', to: '返却場所',
    fees: '料金', base: '基本料金', insurance: '補償プラン', deposit: 'デポジット', total: '合計',
    terms: '主な契約条件',
    t1: 'ガソリンは満タン返し。未給油の場合は実費＋代行手数料を請求します。',
    t2: '事故・破損・紛失・規約違反があった場合、登録カードへ後日実費を請求できることに同意しています（¥0カード登録済み）。',
    t3: '返却期限を過ぎた場合や無連絡不泊は、キャンセルポリシーに基づき返金されません。',
    t4: '車両は貸出前・返却後に写真で状態を記録し、損傷の有無を確認します。',
    consent: '同意状況', consentDamage: '損害補償の同意', consentAt: '同意日時', agreed: '同意済み', notAgreed: '未同意',
    issued: '発行日時', print: '印刷 / PDF保存', note: '本書は電子的に生成された契約控えです。',
    notesTitle: '注意事項',
    notes: [
      '本証は記名本人および記載車両についてのみ有効です。',
      '車両の故障、事故などが発生した場合、または貸渡期間を変更する場合は、必ず事前に当店にご連絡ください。',
      '万一、当店への連絡なく無断で貸渡期間を超過（無断延長）された場合は、理由の如何を問わず、超過期間に対して通常のレンタル料金の3倍に相当する違約金を請求いたします。',
      '本自動車の貸渡しに付随して、運転者の労務供給（運転者の紹介、あっせんを含む）は一切いたしません。',
      '貸渡し期間が2日以上の場合、2日目以降の日常点検はお客様ご自身で実施して頂くことが法令により定められています。',
      '万一、事故等が発生した際は、直ちに最寄りの警察署と貸渡店舗へご連絡いただき、その指示に従ってください。',
      'チャイルドシート等のオプション品に生じた損害（破損・汚損・紛失）、およびそれらの使用・装着に起因して発生した一切の損害（怪我や事故、車両への傷等を含む）については、すべてお客様（ユーザー）側の責任および費用負担となり、当社の保険・補償は一切適用されません。',
      '次のような場合は、保険・補償の適用を一切お断りいたします（すべての損害がお客様の全額自己負担となります）：①事故発生後、速やかに警察および当社への所定の連絡・手続きがとられない場合／②保険約款の免責事項に該当する場合／③貸渡約款に掲げる条項のいずれかに違反している場合。',
      '万一、事故等が発生した場合は、理由の如何を問わず所定の免責料金およびノンオペレーションチャージ（NOC）を申し受けます。',
      '駐車違反をし、警察への出頭および反則金納付の処理をせずに車両を返却された場合、違約金として25,000円を徴収いたします。',
    ],
    insTitle: '保険・補償に関する注意事項（予約サイト経由の場合）',
    insLines: [
      '【保険内容（日本国内）】',
      '車両・対物免責額補償（CDW）：100,000円',
      '第三者責任保険（TPL）：100,000円',
      'ノンオペレーションチャージ（NOC）：50,000円',
      '【プラットフォーム保険をご利用のお客様へ】',
      'ご予約のサイト（プラットフォーム）上で保険に加入しているか、お客様ご自身で必ずご確認ください。',
      '万一事故が発生した場合は、警察および予約サイトの保険窓口へ直ちにご連絡ください。',
      '事故による損害金・免責金等は、日本国内の店舗にてお客様ご自身で先行してお支払いいただく必要がございます。その後、店舗でお渡しする賠償関連書類（領収書や事故証明等）を用いて、お客様ご自身で予約サイトの保険窓口へ還付（補償金）の申請を行ってください。',
    ],
    sigTitle: '署名', sigName: '署名者', sigAt: '署名日時', sigNone: '未署名',
  },
  en: {
    title: 'Rental Agreement', sub: 'BEST Car Rental — electronic agreement', no: 'Contract No.',
    parties: 'Parties', lessor: 'Lessor (Owner / Operator)', lessee: 'Lessee (Customer)',
    vehicle: 'Vehicle', period: 'Rental period', pickup: 'Pickup', ret: 'Return', from: 'Pickup location', to: 'Return location',
    fees: 'Fees', base: 'Base fee', insurance: 'Coverage plan', deposit: 'Deposit', total: 'Total',
    terms: 'Key terms',
    t1: 'Return with a full tank. If not refuelled, the actual fuel cost plus a handling fee will be charged.',
    t2: 'The lessee agrees that actual costs may be charged to the registered card afterward in case of accident, damage, loss, or breach (¥0 card on file).',
    t3: 'Cancellations after the pickup time, and no-shows, are non-refundable per the cancellation policy.',
    t4: 'Vehicle condition is recorded by photos before lending and after return to check for damage.',
    consent: 'Consent', consentDamage: 'Damage liability consent', consentAt: 'Agreed at', agreed: 'Agreed', notAgreed: 'Not agreed',
    issued: 'Issued', print: 'Print / Save PDF', note: 'This is an electronically generated copy of the agreement.',
    notesTitle: 'Important notes',
    notes: [
      'This certificate is valid only for the named person and the listed vehicle.',
      'In case of vehicle failure, an accident, or a change to the rental period, you must contact the store in advance.',
      'If the rental period is exceeded without contacting the store (unauthorized extension), a penalty equal to three (3) times the normal rental rate will be charged for the overrun, regardless of reason.',
      'No provision of driver labor (including introduction or referral of drivers) is offered in connection with this rental.',
      'For rentals of two or more days, the law requires the customer to perform the daily inspection themselves from the second day onward.',
      'In the event of an accident, immediately contact the nearest police station and the rental store, and follow their instructions.',
      'Any damage to optional items such as child seats (breakage, soiling, loss) and any damage arising from their use or installation (including injury, accidents, or scratches to the vehicle) is entirely the customer’s responsibility and expense; our insurance/coverage does not apply.',
      'Coverage will be refused entirely (all damages fully borne by the customer) if: (1) the required report/procedures to the police and to us are not promptly completed after an accident; (2) an exclusion in the insurance terms applies; or (3) any clause of the rental terms is violated.',
      'In the event of an accident, the specified deductible and Non-Operation Charge (NOC) will be charged regardless of reason.',
      'If the vehicle is returned after a parking violation without appearing before the police and paying the fine, a penalty of ¥25,000 will be collected.',
    ],
    insTitle: 'Insurance / coverage notes (for platform bookings)',
    insLines: [
      '[Coverage (within Japan)]',
      'Vehicle / property damage deductible coverage (CDW): ¥100,000',
      'Third-party liability insurance (TPL): ¥100,000',
      'Non-Operation Charge (NOC): ¥50,000',
      '[For customers using platform insurance]',
      'Please confirm yourself whether you purchased insurance on the booking platform.',
      'In the event of an accident, immediately contact the police and the booking platform’s insurance desk.',
      'Accident-related damages/deductibles must first be paid by the customer at the store in Japan. Afterward, use the compensation documents provided by the store (receipts, accident certificate, etc.) to apply for reimbursement from the booking platform’s insurance desk yourself.',
    ],
    sigTitle: 'Signature', sigName: 'Signed by', sigAt: 'Signed at', sigNone: 'Not signed',
  },
  'zh-TW': {
    title: '租車合約', sub: 'BEST Car Rental 電子合約', no: '合約編號',
    parties: '當事人', lessor: '出租方（車主／營運）', lessee: '承租方（用戶）',
    vehicle: '車輛', period: '租用期間', pickup: '取車', ret: '還車', from: '取車地點', to: '還車地點',
    fees: '費用', base: '基本費用', insurance: '保障方案', deposit: '押金', total: '合計',
    terms: '主要合約條款',
    t1: '油箱須加滿歸還。未加油時將收取實際油費及代辦手續費。',
    t2: '如發生事故、破損、遺失或違約，承租方同意日後可向已登記的信用卡收取實際費用（已登記¥0信用卡）。',
    t3: '超過還車時間或未通知未還，依取消政策不予退款。',
    t4: '車輛於出租前與歸還後以照片記錄狀態，以確認是否有損傷。',
    consent: '同意狀況', consentDamage: '損害賠償同意', consentAt: '同意時間', agreed: '已同意', notAgreed: '未同意',
    issued: '發行時間', print: '列印 / 儲存PDF', note: '本文件為電子生成的合約副本。',
    notesTitle: '注意事項',
    notes: [
      '本證僅對記名本人及所載車輛有效。',
      '如發生車輛故障、事故，或需變更租用期間，務必事先與本店聯絡。',
      '若未經本店聯絡擅自超過租用期間（擅自延長），無論理由為何，將就超過期間收取相當於正常租金3倍的違約金。',
      '本車輛出租不附帶提供駕駛勞務（包含介紹或仲介駕駛）。',
      '租用期間為2天以上時，法令規定第2天起的日常檢查須由客戶自行實施。',
      '萬一發生事故等，請立即聯絡最近的警察局與出租店舖，並依其指示處理。',
      '兒童座椅等選配品所生之損害（破損、汙損、遺失），以及因其使用・安裝所引起的一切損害（含受傷、事故、車輛刮傷等），全部由客戶（用戶）負責及負擔費用，本公司保險・補償一概不適用。',
      '有下列情形之一時，一概不適用保險・補償（所有損害由客戶全額自行負擔）：①事故後未即時向警察及本公司進行規定的聯絡・手續；②符合保險條款免責事項；③違反租車條款任一條款。',
      '萬一發生事故等，無論理由為何，將收取規定的免責費用及停業損失費（NOC）。',
      '若違規停車且未向警察報到及繳納罰款即歸還車輛，將收取25,000日圓作為違約金。',
    ],
    insTitle: '保險・補償注意事項（透過預訂網站時）',
    insLines: [
      '【保障內容（日本國內）】',
      '車輛・對物免責額保障（CDW）：100,000日圓',
      '第三人責任保險（TPL）：100,000日圓',
      '停業損失費（NOC）：50,000日圓',
      '【使用平台保險的客戶請注意】',
      '請務必自行確認是否已於預訂網站（平台）上投保。',
      '萬一發生事故，請立即聯絡警察及預訂網站的保險窗口。',
      '事故所生之損害金・免責金等，須由客戶於日本國內店舖先行支付。之後請使用店舖提供的賠償相關文件（收據或事故證明等），自行向預訂網站的保險窗口申請還付（補償金）。',
    ],
    sigTitle: '簽名', sigName: '簽署人', sigAt: '簽署時間', sigNone: '未簽名',
  },
  'zh-CN': {
    title: '租车合约', sub: 'BEST Car Rental 电子合约', no: '合约编号',
    parties: '当事人', lessor: '出租方（车主／运营）', lessee: '承租方（用户）',
    vehicle: '车辆', period: '租用期间', pickup: '取车', ret: '还车', from: '取车地点', to: '还车地点',
    fees: '费用', base: '基本费用', insurance: '保障方案', deposit: '押金', total: '合计',
    terms: '主要合约条款',
    t1: '油箱须加满归还。未加油时将收取实际油费及代办手续费。',
    t2: '如发生事故、破损、丢失或违约，承租方同意日后可向已登记的银行卡收取实际费用（已登记¥0银行卡）。',
    t3: '超过还车时间或未通知未还，依取消政策不予退款。',
    t4: '车辆于出租前与归还后以照片记录状态，以确认是否有损伤。',
    consent: '同意状况', consentDamage: '损害赔偿同意', consentAt: '同意时间', agreed: '已同意', notAgreed: '未同意',
    issued: '发行时间', print: '打印 / 保存PDF', note: '本文件为电子生成的合约副本。',
    notesTitle: '注意事项',
    notes: [
      '本证仅对记名本人及所载车辆有效。',
      '如发生车辆故障、事故，或需变更租用期间，务必事先与本店联系。',
      '若未经本店联系擅自超过租用期间（擅自延长），无论理由为何，将就超过期间收取相当于正常租金3倍的违约金。',
      '本车辆出租不附带提供驾驶劳务（包含介绍或中介驾驶）。',
      '租用期间为2天以上时，法令规定第2天起的日常检查须由客户自行实施。',
      '万一发生事故等，请立即联系最近的警察局与出租店铺，并按其指示处理。',
      '儿童座椅等选配品所生之损害（破损、污损、丢失），以及因其使用・安装所引起的一切损害（含受伤、事故、车辆刮伤等），全部由客户（用户）负责及承担费用，本公司保险・补偿一概不适用。',
      '有下列情形之一时，一概不适用保险・补偿（所有损害由客户全额自行承担）：①事故后未及时向警察及本公司进行规定的联系・手续；②符合保险条款免责事项；③违反租车条款任一条款。',
      '万一发生事故等，无论理由为何，将收取规定的免责费用及停运损失费（NOC）。',
      '若违规停车且未向警察报到及缴纳罚款即归还车辆，将收取25,000日元作为违约金。',
    ],
    insTitle: '保险・补偿注意事项（通过预约网站时）',
    insLines: [
      '【保障内容（日本国内）】',
      '车辆・对物免责额保障（CDW）：100,000日元',
      '第三方责任保险（TPL）：100,000日元',
      '停运损失费（NOC）：50,000日元',
      '【使用平台保险的客户请注意】',
      '请务必自行确认是否已在预约网站（平台）上投保。',
      '万一发生事故，请立即联系警察及预约网站的保险窗口。',
      '事故所生之损害金・免责金等，须由客户在日本国内店铺先行支付。之后请使用店铺提供的赔偿相关文件（收据或事故证明等），自行向预约网站的保险窗口申请退还（补偿金）。',
    ],
    sigTitle: '签名', sigName: '签署人', sigAt: '签署时间', sigNone: '未签名',
  },
  ko: {
    title: '렌탈 계약서', sub: 'BEST Car Rental 전자 계약서', no: '계약 번호',
    parties: '당사자', lessor: '대여자(차주／운영)', lessee: '차용자(이용자)',
    vehicle: '차량', period: '이용 기간', pickup: '대여', ret: '반납', from: '대여 장소', to: '반납 장소',
    fees: '요금', base: '기본 요금', insurance: '보장 플랜', deposit: '보증금', total: '합계',
    terms: '주요 계약 조건',
    t1: '연료는 가득 채워 반납. 미주유 시 실비와 대행 수수료를 청구합니다.',
    t2: '사고・파손・분실・약관 위반 시, 등록된 카드로 추후 실비를 청구할 수 있음에 동의합니다(¥0 카드 등록 완료).',
    t3: '반납 기한 초과 및 무연락 미반납은 취소 정책에 따라 환불되지 않습니다.',
    t4: '차량 상태는 대여 전・반납 후 사진으로 기록하여 손상 여부를 확인합니다.',
    consent: '동의 상황', consentDamage: '손해배상 동의', consentAt: '동의 일시', agreed: '동의함', notAgreed: '미동의',
    issued: '발행 일시', print: '인쇄 / PDF 저장', note: '본 문서는 전자적으로 생성된 계약 사본입니다.',
    notesTitle: '유의사항',
    notes: [
      '본 증서는 기명 본인 및 기재된 차량에 대해서만 유효합니다.',
      '차량 고장・사고 발생 시, 또는 대여 기간 변경 시 반드시 사전에 당점에 연락해 주세요.',
      '당점에 연락 없이 무단으로 대여 기간을 초과(무단 연장)한 경우, 이유를 불문하고 초과 기간에 대해 통상 렌탈 요금의 3배에 해당하는 위약금을 청구합니다.',
      '본 차량 대여에 부수하여 운전자 노무 제공(운전자 소개・알선 포함)은 일절 하지 않습니다.',
      '대여 기간이 2일 이상인 경우, 2일째 이후의 일상 점검은 고객이 직접 실시하도록 법령으로 정해져 있습니다.',
      '만일 사고 등이 발생한 경우, 즉시 가까운 경찰서와 대여 점포에 연락하고 그 지시에 따라 주세요.',
      '카시트 등 옵션 품목에 생긴 손해(파손・오손・분실) 및 그 사용・장착으로 인해 발생한 일체의 손해(부상・사고・차량 흠집 등 포함)는 모두 고객(이용자) 측의 책임과 비용 부담이며, 당사의 보험・보상은 일절 적용되지 않습니다.',
      '다음과 같은 경우 보험・보상 적용을 일절 거부합니다(모든 손해는 고객 전액 자기 부담): ①사고 후 경찰 및 당사에 규정된 연락・절차가 신속히 이뤄지지 않은 경우 ②보험 약관 면책 사항에 해당하는 경우 ③대여 약관 조항 중 어느 하나를 위반한 경우.',
      '만일 사고 등이 발생한 경우, 이유를 불문하고 소정의 면책 요금 및 영업보상료(NOC)를 청구합니다.',
      '주차 위반을 하고 경찰 출석 및 범칙금 납부 처리를 하지 않은 채 차량을 반납한 경우, 위약금으로 25,000엔을 징수합니다.',
    ],
    insTitle: '보험・보상 유의사항(예약 사이트 경유 시)',
    insLines: [
      '[보장 내용(일본 국내)]',
      '차량・대물 면책액 보장(CDW): 100,000엔',
      '제3자 책임보험(TPL): 100,000엔',
      '영업보상료(NOC): 50,000엔',
      '[플랫폼 보험을 이용하는 고객께]',
      '예약 사이트(플랫폼)에서 보험에 가입했는지 반드시 직접 확인해 주세요.',
      '만일 사고가 발생하면 경찰 및 예약 사이트의 보험 창구로 즉시 연락해 주세요.',
      '사고로 인한 손해금・면책금 등은 일본 국내 점포에서 고객이 먼저 지불하셔야 합니다. 이후 점포에서 받은 배상 관련 서류(영수증・사고 증명 등)를 사용하여 고객이 직접 예약 사이트 보험 창구에 환급(보상금)을 신청해 주세요.',
    ],
    sigTitle: '서명', sigName: '서명자', sigAt: '서명 일시', sigNone: '미서명',
  },
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const reservationId = searchParams.get('reservationId');
  const rawLoc = searchParams.get('locale') || 'ja';
  const locale = L[rawLoc] ? rawLoc : (rawLoc.startsWith('ja') ? 'ja' : rawLoc.startsWith('ko') ? 'ko' : rawLoc.startsWith('zh') ? (rawLoc.includes('CN') ? 'zh-CN' : 'zh-TW') : 'en');
  const download = searchParams.get('download') === '1';
  const tr = L[locale];

  if (!reservationId) return new Response('reservationId required', { status: 400 });
  if (!supabaseAdmin) return new Response('Supabase not configured', { status: 503 });

  const { data: r } = await supabaseAdmin
    .from('reservations').select('*').eq('id', reservationId).single();
  if (!r) return new Response('Reservation not found', { status: 404 });

  let vehicle = null;
  if (r.vehicle_id) {
    const { data: v } = await supabaseAdmin.from('vehicles').select('maker, model, year, license_plate').eq('id', r.vehicle_id).single();
    vehicle = v;
  }
  const opts = r.opts ?? {};
  const sig = opts.signature ?? null;
  const base = Number(opts.basePrice ?? r.total ?? 0);
  const insAmt = Number(opts.insuranceAmount ?? 0);
  const deposit = Number(opts.deposit ?? 0);
  const total = Number(r.total ?? base + insAmt);
  const consentAt = opts.damageConsentAt ?? r.preauth_at ?? null;
  const vehicleName = vehicle ? `${esc(vehicle.maker)} ${esc(vehicle.model)}${vehicle.year ? ' ' + vehicle.year : ''}${vehicle.license_plate ? ' / ' + esc(vehicle.license_plate) : ''}` : (r.vehicle_id ?? '—');

  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${tr.title} ${esc(reservationId)}</title>
<style>
  :root{--p:#7c3aed}
  *{box-sizing:border-box} body{font-family:-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;color:#1f2937;margin:0;background:#f3f0ff;padding:24px}
  .doc{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;box-shadow:0 8px 30px rgba(124,58,237,.08)}
  .hd{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid var(--p);padding-bottom:12px;margin-bottom:16px}
  .hd h1{font-size:20px;margin:0;color:var(--p)} .hd .sub{font-size:11px;color:#6b7280}
  .no{font-family:monospace;font-size:13px;color:#374151}
  h2{font-size:13px;color:var(--p);margin:18px 0 8px;border-left:4px solid var(--p);padding-left:8px}
  table{width:100%;border-collapse:collapse;font-size:13px} th,td{border:1px solid #eee;padding:8px 10px;text-align:left;vertical-align:top}
  th{background:#faf8ff;width:38%;font-weight:600;color:#4b5563}
  .fees td:last-child{text-align:right;font-variant-numeric:tabular-nums} .total{font-weight:800;color:var(--p)}
  ol{font-size:12.5px;line-height:1.7;padding-left:18px;margin:6px 0}
  ol.notes li{margin-bottom:6px}
  .ins{font-size:12px;line-height:1.7;background:#faf8ff;border:1px solid #eee;border-radius:8px;padding:10px 12px}
  .ins p{margin:2px 0}
  .sig img{max-width:280px;max-height:120px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;display:block;margin-bottom:8px}
  .badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700}
  .ok{background:#dcfce7;color:#166534} .ng{background:#fee2e2;color:#991b1b}
  .foot{margin-top:18px;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between;align-items:center}
  .btn{border:0;background:var(--p);color:#fff;font-weight:700;border-radius:10px;padding:9px 16px;cursor:pointer}
  @media print{body{background:#fff;padding:0}.doc{border:0;box-shadow:none}.btn{display:none}}
</style></head>
<body><div class="doc">
  <div class="hd"><div><h1>${tr.title}</h1><div class="sub">${tr.sub}</div></div>
    <div class="no">${tr.no}<br>${esc(reservationId)}</div></div>

  <h2>${tr.parties}</h2>
  <table>
    ${row(tr.lessor, 'BEST Car Rental')}
    ${row(tr.lessee, esc(r.guest_name || r.guestName || '—') + (r.guest_email ? ' &lt;' + esc(r.guest_email) + '&gt;' : ''))}
  </table>

  <h2>${tr.vehicle} / ${tr.period}</h2>
  <table>
    ${row(tr.vehicle, vehicleName)}
    ${row(tr.pickup, dt(r.pickup_at))}
    ${row(tr.ret, dt(r.return_at))}
    ${row(tr.from, esc(r.pickup_loc || '—'))}
    ${row(tr.to, esc(r.return_loc || '—'))}
  </table>

  <h2>${tr.fees}</h2>
  <table class="fees">
    ${row(tr.base, yen(base))}
    ${insAmt > 0 ? row(tr.insurance + (opts.insurancePlan ? ' (' + esc(opts.insurancePlan) + ')' : ''), yen(insAmt)) : ''}
    ${deposit > 0 ? row(tr.deposit, yen(deposit)) : ''}
    <tr class="total"><th>${tr.total}</th><td>${yen(total)}</td></tr>
  </table>

  <h2>${tr.terms}</h2>
  <ol><li>${tr.t1}</li><li>${tr.t2}</li><li>${tr.t3}</li><li>${tr.t4}</li></ol>

  <h2>${tr.notesTitle}</h2>
  <ol class="notes">${tr.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ol>

  <h2>${tr.insTitle}</h2>
  <div class="ins">${tr.insLines.map(n => `<p>${esc(n)}</p>`).join('')}</div>

  <h2>${tr.consent}</h2>
  <table>
    ${row(tr.consentDamage, opts.damageConsent ? `<span class="badge ok">${tr.agreed}</span>` : `<span class="badge ng">${tr.notAgreed}</span>`)}
    ${consentAt ? row(tr.consentAt, dt(consentAt)) : ''}
  </table>

  <h2>${tr.sigTitle}</h2>
  ${sig?.dataUrl
    ? `<div class="sig"><img src="${esc(sig.dataUrl)}" alt="signature"><table>${row(tr.sigName, esc(sig.name || r.guest_name || '—'))}${row(tr.sigAt, sig.signedAt ? dt(sig.signedAt) : '—')}</table></div>`
    : `<table>${row(tr.sigTitle, `<span class="badge ng">${tr.sigNone}</span>`)}</table>`}

  <div class="foot"><span>${tr.issued}: ${dt(new Date().toISOString())} · ${tr.note}</span>
    <button class="btn" onclick="window.print()">${tr.print}</button></div>
</div></body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...(download ? { 'Content-Disposition': `attachment; filename="contract-${reservationId}.html"` } : {}),
    },
  });
}
