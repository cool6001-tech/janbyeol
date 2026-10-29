/**
 * 잔별 '카드로 간직하기' 시트 (card-sheet.js)
 * ------------------------------------------------------------
 * 사용법:
 *   import { openCardSheet } from "./card-sheet.js";
 *   openCardSheet(star, "mine");     // 내가 띄운 별 (완료 화면, 공감 알림)
 *   openCardSheet(star, "comfort");  // 나를 비춘 별 (남의 별에 공감을 누른 직후)
 *
 * 중요: 휴대폰 공유창(navigator.share)은 '사용자가 방금 누른 버튼' 안에서만 열립니다.
 * 영상은 만드는 데 몇 초가 걸리므로 [만들기] → [공유하기] 두 번 누르게 했습니다.
 */
import { makeCardImage, makeCardVideo, canMakeVideo, shareCardFile, isInAppBrowser, isMobileDevice } from './star-card.js'

const CSS = `
.jb-sheet-bg{position:fixed;inset:0;background:rgba(2,3,8,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center}
.jb-sheet{width:100%;max-width:480px;background:#151a38;border-top:1px solid #2C3566;border-radius:24px 24px 0 0;padding:24px 20px 28px;color:#E8EAF6;font-family:var(--sans, 'Noto Sans KR', sans-serif)}
.jb-sheet h3{margin:0 0 4px;font-size:19px;text-align:center}
.jb-sheet p{margin:0 0 16px;font-size:13px;color:#9AA0C3;text-align:center}
.jb-prev{display:block;width:46%;margin:0 auto 16px;border-radius:14px;aspect-ratio:9/16;object-fit:cover;background:#0b0f26}
.jb-btn{display:block;width:100%;border:0;border-radius:14px;padding:14px;font-size:16px;font-weight:500;font-family:inherit;margin-top:10px;cursor:pointer}
.jb-btn.p{background:#F5D58A;color:#10132a}.jb-btn.s{background:transparent;border:1px solid #2C3566;color:#C9CCE4;font-weight:500}
.jb-btn:disabled{opacity:.5}.jb-bar{height:4px;border-radius:2px;background:#2C3566;overflow:hidden;margin:6px 0 2px}
.jb-bar i{display:block;height:100%;width:0;background:#F5D58A;transition:width .2s}.jb-note{font-size:12px;color:#9AA0C3;text-align:center;margin-top:10px}`;

function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }

export async function openCardSheet(star, type = "mine", { onLinkShare } = {}) {
  if (!document.getElementById("jb-sheet-css")) {
    const st = document.createElement("style"); st.id = "jb-sheet-css"; st.textContent = CSS; document.head.appendChild(st);
  }
  const bg = el(`<div class="jb-sheet-bg"><div class="jb-sheet">
      <h3>${type === "comfort" ? "나를 비춘 별을 나눠요" : "내 별을 나눠요"}</h3>
      <p>스토리에 올린 뒤, 링크 스티커에 복사된 주소를 붙여 주세요</p>
      <img class="jb-prev" alt="별 카드 미리보기">
      <button class="jb-btn p" data-act="img">${isMobileDevice() ? "이미지로 저장·공유" : "이미지로 저장하기"}</button>
      <button class="jb-btn s" data-act="vid">움직이는 카드 만들기</button>
      <div class="jb-bar" hidden><i></i></div>
      <div class="jb-note" hidden></div>
      <button class="jb-btn s" data-act="link" hidden>링크로 보내기</button>
      <button class="jb-btn s" data-act="close" style="border:0;color:#7d83a8">닫기</button>
    </div></div>`);
  document.body.appendChild(bg);
  const $ = (s) => bg.querySelector(s);
  const note = (t) => { $(".jb-note").hidden = !t; $(".jb-note").textContent = t || ""; };
  const close = () => bg.remove();
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  $('[data-act="close"]').onclick = close;
  // 예전 '공유하기' — 글 한 줄이 담긴 미리보기와 함께 링크를 보냅니다 (카카오톡에서 바로 열려요)
  if (onLinkShare) { const lb = $('[data-act="link"]'); lb.hidden = false; lb.onclick = () => onLinkShare(); }

  if (isInAppBrowser()) note("카카오톡·인스타그램 앱 안에서는 저장이 안 될 수 있어요. 오른쪽 위 메뉴에서 ‘다른 브라우저로 열기’를 눌러 주세요.");

  // 이미지는 금방 만들어지니 시트를 열 때 미리 만들어 둡니다 → 버튼 한 번으로 바로 공유
  const imgBlob = await makeCardImage(star, type);
  $(".jb-prev").src = URL.createObjectURL(imgBlob);
  const saved = (r) => { if (r === "downloaded") note("다운로드 폴더에 저장했어요. 카카오톡 대화방이나 인스타그램에 파일을 끌어다 놓으면 보낼 수 있어요."); };
  $('[data-act="img"]').onclick = async () => { saved(await shareCardFile(imgBlob, star)); track("card_share", type, "image"); };

  const vidBtn = $('[data-act="vid"]');
  if (!canMakeVideo()) { vidBtn.hidden = true; return; }
  let vidBlob = null;
  vidBtn.onclick = async () => {
    if (vidBlob) { saved(await shareCardFile(vidBlob, star)); track("card_share", type, "video"); return; }
    vidBtn.disabled = true; vidBtn.textContent = "별자리를 담는 중…"; $(".jb-bar").hidden = false;
    try {
      vidBlob = await makeCardVideo(star, type, { seconds: 15, onProgress: (p) => ($(".jb-bar i").style.width = `${Math.round(p * 100)}%`) });
      vidBtn.textContent = isMobileDevice() ? "움직이는 카드 공유하기" : "움직이는 카드 저장하기";        // 두 번째 탭에서 공유창이 열립니다
      vidBtn.classList.replace("s", "p");
      $(".jb-prev").outerHTML = `<video class="jb-prev" src="${URL.createObjectURL(vidBlob)}" autoplay muted loop playsinline></video>`;
    } catch (e) {
      vidBtn.hidden = true; note("이 기기에서는 움직이는 카드를 만들 수 없어요. 이미지 카드를 이용해 주세요.");
    } finally { vidBtn.disabled = false; $(".jb-bar").hidden = true; }
  };
}

// 분석 도구를 붙이면 여기서 기록하세요 (지금은 아무 일도 하지 않습니다).
function track(name, type, format) {
  try { window.gtag?.("event", name, { card_type: type, card_format: format }); } catch (_) {}
}
