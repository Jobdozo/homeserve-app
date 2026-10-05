import { Link } from "react-router-dom";
import LogoMark from "./LogoMark";

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.tikdum.customer";
const PROVIDER_SITE = "https://provider.tikdum.com";

function Col({ title, children }) {
  return (
    <div>
      <p className="text-[13px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
      <ul className="mt-4 space-y-2.5 text-[14.5px] text-gray-600">{children}</ul>
    </div>
  );
}

const linkCls = "hover:text-brand";

export default function DesktopFooter() {
  return (
    <footer className="hidden flex-shrink-0 border-t border-gray-100 bg-white lg:block">
      <div className="mx-auto grid max-w-6xl grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr] gap-10 px-8 py-14">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
              <LogoMark size={19} />
            </span>
            <span className="text-[19px] font-extrabold text-gray-900">Tikdum</span>
          </div>
          <p className="mt-4 max-w-[240px] text-[14px] leading-relaxed text-gray-500">
            Trusted home services at your doorstep, across Jammu &amp; Kashmir.
          </p>
        </div>

        <Col title="Company">
          <li>
            <a href="/about.html" className={linkCls}>About us</a>
          </li>
          <li>
            <a href="/terms.html" className={linkCls}>Terms &amp; conditions</a>
          </li>
          <li>
            <a href="/privacy.html" className={linkCls}>Privacy policy</a>
          </li>
          <li>
            <Link to="/booking-protection" className={linkCls}>Booking protection</Link>
          </li>
          <li>
            <a href="/delete-account.html" className={linkCls}>Delete account</a>
          </li>
        </Col>

        <Col title="For customers">
          <li>
            <Link to="/categories" className={linkCls}>All categories</Link>
          </li>
          <li>
            <Link to="/services" className={linkCls}>All services</Link>
          </li>
          <li>
            <Link to="/profile/help" className={linkCls}>Help &amp; support</Link>
          </li>
        </Col>

        <Col title="For professionals">
          <li>
            <a href={PROVIDER_SITE} target="_blank" rel="noreferrer" className={linkCls}>Register as a professional</a>
          </li>
        </Col>

        <Col title="Contact & app">
          <li>
            <a href="mailto:support@tikdum.com" className={linkCls}>support@tikdum.com</a>
          </li>
          <li>
            <a href="tel:+919419149336" className={linkCls}>+91 94191 49336</a>
          </li>
          <li>
            <a
              href={PLAY_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-700"
            >
              Get it on Google Play
            </a>
          </li>
        </Col>
      </div>
      <div className="border-t border-gray-100">
        <p className="mx-auto max-w-6xl px-8 py-5 text-[13px] text-gray-400">© {new Date().getFullYear()} Tikdum. All rights reserved.</p>
      </div>
    </footer>
  );
}
