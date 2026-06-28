import { Theme } from "@radix-ui/themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@radix-ui/themes/styles.css";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(
	<StrictMode>
		<Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="medium">
			<App />
		</Theme>
	</StrictMode>,
);
