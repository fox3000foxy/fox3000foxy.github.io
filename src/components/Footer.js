import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import "./Footer.css";
const YEAR = new Date().getFullYear();
export default function Footer() {
    return (_jsx("footer", { children: _jsxs("p", { children: ["\u00A9 ", YEAR, " Fox's Blog"] }) }));
}
