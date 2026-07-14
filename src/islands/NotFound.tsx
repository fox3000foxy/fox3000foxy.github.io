import { Link } from "../lib/navigation";
import { useLang } from "../hooks/useLang";

interface Props {
	message?: string;
}

export default function NotFound({ message }: Props) {
	const { t } = useLang();

	return (
		<div>
			<h2>404</h2>
			<p>{message || t("notFound.title")}</p>
			<p>
				<Link to="/">{t("notFound.return")}</Link>
			</p>
		</div>
	);
}
