import Link from "next/link";
import {
  ArrowRight, Bot, Check, Clock3, FileCheck2, FileText, Headphones,
  MessageCircle, Moon, Search, ShieldCheck, Sparkles, UploadCloud, Users, Zap,
} from "lucide-react";

const problems = [
  [Moon, "야간·주말 문의는 그냥 쌓입니다", "업무 시간 외 문의가 다음 날로 밀리면, 구매를 고민하던 고객도 함께 떠납니다."],
  [MessageCircle, "같은 질문에 같은 답을 반복합니다", "배송·환불·요금처럼 반복되는 문의가 상담팀의 중요한 시간을 차지합니다."],
  [Users, "상담 인력을 늘리기엔 부담이 큽니다", "24시간 응대를 위해 인력을 늘리는 방식은 비용도 관리도 어렵습니다."],
  [Bot, "기존 챗봇은 정해진 버튼만 압니다", "고객이 표현을 조금만 바꾸면 엉뚱한 답을 내놓거나 곧바로 막힙니다."],
] as const;

const cases = [
  ["USE CASE 01", "단순 반복 문의 자동화", "배송·요금·환불 등 반복 질문을 문서 근거로 즉시 안내합니다."],
  ["USE CASE 02", "스타트업 CS 인력 부족 해소", "초기 스타트업의 고객 문의를 AI가 먼저 정확하게 응대합니다."],
  ["USE CASE 03", "야간·주말 안내 및 리드 수집", "업무 외 시간에도 답변하고 필요한 고객 정보를 놓치지 않습니다."],
  ["USE CASE 04", "웹사이트 방문자 상담 전환", "궁금증을 즉시 해소해 이탈률을 낮추고 상담 전환을 높입니다."],
];

function Brand() {
  return (
    <Link className="brand" href="/" aria-label="ELA Chatbot 홈">
      <span className="brand-mark"><MessageCircle size={18} strokeWidth={2.4} /></span>
      <span>ELA</span><span className="brand-muted">Chatbot</span>
    </Link>
  );
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav aria-label="주요 메뉴">
            <a href="#features">기능</a><a href="#use-cases">활용 사례</a><a href="#how">이용 방법</a>
          </nav>
          <div className="header-actions">
            <Link className="button button-ghost" href="/admin">관리자</Link>
            <Link className="button button-primary" href="/app">데모 시작 <ArrowRight size={16} /></Link>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-glow" />
        <div className="container hero-inner">
          <div className="eyebrow"><Sparkles size={14} /> AI 기반 문서형 고객상담 SaaS</div>
          <h1>문서 하나로,<br /><span>24시간 상담사가 생깁니다</span></h1>
          <p className="hero-copy">서비스 매뉴얼·FAQ·정책 문서를 업로드하면<br className="desktop-only" /> AI가 문서의 근거를 찾아 자연스러운 대화로 즉시 답변합니다.</p>
          <div className="hero-actions">
            <Link className="button button-primary button-large" href="/app">무료로 체험하기 <ArrowRight size={18} /></Link>
            <a className="button button-secondary button-large" href="#how">작동 방식 보기</a>
          </div>

          <div className="product-window" aria-label="ELA Chatbot 제품 미리보기">
            <div className="window-top">
              <div className="traffic-lights"><i /><i /><i /></div>
              <div className="address-bar">ela-chatbot.ai · 고객상담 위젯 미리보기</div>
            </div>
            <div className="window-body">
              <div className="chat-preview">
                <div className="chat-preview-head">
                  <span className="avatar blue"><Bot size={16} /></span>
                  <div><strong>ELA 상담 어시스턴트</strong><span className="online">온라인 · 24시간 응대 중</span></div>
                </div>
                <div className="preview-divider" />
                <div className="message-row assistant">
                  <span className="mini-avatar"><Bot size={13} /></span>
                  <p>안녕하세요! 무엇을 도와드릴까요? 서비스 이용, 요금, 환불 등 편하게 질문해 주세요.</p>
                </div>
                <div className="message-row user"><p>환불 신청은 어떻게 하나요?</p><span className="mini-avatar user-avatar">나</span></div>
                <div className="message-row assistant">
                  <span className="mini-avatar"><Bot size={13} /></span>
                  <p>구매일로부터 <strong>7일 이내</strong>에 마이페이지 → 주문내역 → 환불 신청으로 진행하시면 됩니다. 영업일 기준 3일 내 처리됩니다.</p>
                </div>
                <div className="message-row user"><p>야간에도 신청 가능한가요?</p><span className="mini-avatar user-avatar">나</span></div>
                <div className="message-row assistant typing"><span className="mini-avatar"><Bot size={13} /></span><p><i /><i /><i /></p></div>
              </div>
              <aside className="knowledge-preview">
                <span className="panel-label"><FileCheck2 size={14} /> 연결된 문서</span>
                {[["서비스 이용약관.pdf", "42페이지"], ["FAQ 모음.pdf", "127개 항목"], ["환불·배송 정책.pdf", "18페이지"]].map(([name, meta]) => (
                  <div className="doc-mini" key={name}>
                    <FileText size={17} /><div><strong>{name}</strong><span>지식 반영 완료 · {meta}</span></div><Check size={14} />
                  </div>
                ))}
                <div className="metric-title">운영 현황</div>
                <div className="metric-grid">
                  <div><strong>98%</strong><span>답변 정확도</span></div><div><strong>1.2초</strong><span>평균 응답</span></div>
                  <div><strong>24/7</strong><span>운영 시간</span></div><div><strong>↓ 82%</strong><span>반복 문의</span></div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-muted">
        <div className="container">
          <div className="section-heading left"><span>공감하시나요?</span><h2>이런 고민, 있으신가요?</h2><p>많은 기업이 고객 응대에서 비슷한 어려움을 겪고 있습니다.</p></div>
          <div className="problem-grid">
            {problems.map(([Icon, title, body]) => (
              <article className="info-card problem-card" key={title}><span className="icon-box coral"><Icon size={21} /></span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="container">
          <div className="section-heading left"><span>핵심 기능</span><h2>ELA Chatbot이<br />모든 것을 해결합니다</h2><p>정확한 검색과 출처 기반 답변으로 고객 응대의 전 과정을 자동화합니다.</p></div>
          <div className="feature-grid">
            <article className="feature-card feature-wide">
              <div><span className="icon-box"><FileText size={22} /></span><h3>문서 업로드만으로 지식 자동 반영</h3><p>서비스 소개서, FAQ, 이용약관, 정책 문서를 올리면 내용을 구조별로 분석하고 검색 가능한 지식 인덱스로 만듭니다.</p><div className="tag-row"><span>PDF·DOCX·XLSX</span><span>자동 인덱싱</span><span>출처 보존</span></div></div>
              <div className="pipeline-card">
                <div><strong>업로드</strong><span>서비스 FAQ.pdf, 이용약관.pdf</span></div><ArrowRight size={15} />
                <div><strong>인덱싱</strong><span>145개 청크 · 검색 인덱스 완료</span></div><ArrowRight size={15} />
                <div className="pipeline-success"><Check size={16} /><span>답변 가능한 상태</span></div>
              </div>
            </article>
            {[
              [MessageCircle, "자연어 대화형 응대", "표현이 달라도 질문의 의도를 파악해 근거 중심으로 친절하게 답변합니다.", ["의도 파악", "대화형 답변"]],
              [Clock3, "24시간 365일 무중단 응대", "야간·주말·공휴일에도 즉시 응대해 CS 인력 부담과 대기 시간을 줄입니다.", ["24/7 운영", "즉시 응답"]],
              [Search, "하이브리드 검색과 리랭킹", "벡터·키워드 검색 결과를 결합하고 로컬 리랭커가 가장 관련 있는 근거를 고릅니다.", ["BGE-M3", "RRF", "Reranker"]],
              [ShieldCheck, "근거와 출처가 분명한 답변", "답변에 사용된 문서명, 페이지, 섹션과 원문 일부를 함께 확인할 수 있습니다.", ["출처 검증", "추측 방지"]],
            ].map(([Icon, title, body, tags]) => {
              const ItemIcon = Icon as typeof MessageCircle;
              return <article className="feature-card" key={title as string}><span className="icon-box"><ItemIcon size={21} /></span><h3>{title as string}</h3><p>{body as string}</p><div className="tag-row">{(tags as string[]).map((tag) => <span key={tag}>{tag}</span>)}</div></article>;
            })}
          </div>
        </div>
      </section>

      <section className="section section-muted" id="use-cases">
        <div className="container">
          <div className="section-heading left"><span>활용 분야</span><h2>다양한 상황에서<br />바로 활용하세요</h2><p>어떤 목적이든, ELA Chatbot으로 빠르게 시작할 수 있습니다.</p></div>
          <div className="case-grid">{cases.map(([label, title, body]) => <article className="info-card case-card" key={label}><span className="case-label">{label}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="container">
          <div className="section-heading centered"><span>이용 방법</span><h2>단 3단계로 챗봇 운영 시작</h2><p>복잡한 설정 없이, 회사 문서를 올리는 것만으로 맞춤 챗봇이 완성됩니다.</p></div>
          <div className="steps">
            {[[UploadCloud, "01", "문서 업로드", "FAQ, 정책, 매뉴얼을 간편하게 업로드합니다."], [Zap, "02", "지식 인덱싱", "문서를 분석해 임베딩과 검색 인덱스를 만듭니다."], [Headphones, "03", "웹사이트 적용", "설치 코드를 붙이면 즉시 고객 응대가 시작됩니다."]].map(([Icon, n, title, body], index) => {
              const StepIcon = Icon as typeof UploadCloud;
              return <article className="step" key={n as string}>{index < 2 && <div className="step-line" />}<span className="step-number">{n as string}</span><span className="step-icon"><StepIcon size={22} /></span><h3>{title as string}</h3><p>{body as string}</p></article>;
            })}
          </div>
        </div>
      </section>

      <section className="cta-section"><div className="container cta-card"><div><span className="cta-kicker">답변할 준비가 되셨나요?</span><h2>회사 문서를, 고객이 이해하는 답변으로.</h2><p>ELA Chatbot으로 오늘부터 반복 문의를 줄여보세요.</p></div><Link className="button button-white button-large" href="/admin">문서 연결 시작하기 <ArrowRight size={18} /></Link></div></section>
      <footer><div className="container footer-inner"><Brand /><p>문서 근거로 답하는 기업용 AI 고객상담 플랫폼</p><span>© 2026 ELA Chatbot</span></div></footer>
      <Link className="floating-chat" href="/app" aria-label="ELA Chatbot 열기"><MessageCircle size={24} /></Link>
    </main>
  );
}
