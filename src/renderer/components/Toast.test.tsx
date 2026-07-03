// src/renderer/components/Toast.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { Toast } from "./Toast";

beforeEach(() => useDiscoveryStore.setState({ toast: null }));

describe("Toast", () => {
  it("renders nothing when no toast", () => {
    const { container } = render(<Toast />);
    expect(container.firstChild).toBeNull();
  });
  it("renders the toast message", () => {
    useDiscoveryStore.setState({ toast: "Copied 10.0.0.2" });
    render(<Toast />);
    expect(screen.getByText("Copied 10.0.0.2")).toBeTruthy();
  });
});
