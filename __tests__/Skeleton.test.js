import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";
import Skeleton from "../src/components/Skeleton";

describe("Skeleton", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders an accessible loading placeholder that announces busy state", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);

    await render(<Skeleton height={40} testID="sk" />);

    expect(screen.getByTestId("sk")).toBeTruthy();
    expect(screen.getByTestId("sk").props.accessibilityLabel).toBe("Loading");
    await waitFor(() =>
      expect(screen.getByTestId("sk").props.accessibilityState?.busy).toBe(
        true
      )
    );
  });

  it("renders statically when reduce motion is enabled", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);

    await render(<Skeleton testID="sk" />);

    await waitFor(() =>
      expect(
        screen.getByTestId("sk").props.accessibilityState?.busy
      ).toBeUndefined()
    );
  });

  it("keeps the default dark-on-light tint", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);

    await render(<Skeleton testID="sk" />);

    expect(
      StyleSheet.flatten(screen.getByTestId("sk").props.style).backgroundColor
    ).toBe("rgba(17,26,58,0.12)");
  });

  it("uses the custom tint when one is given (dark surfaces)", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);

    await render(<Skeleton testID="sk" color="rgba(255,255,255,0.14)" />);

    expect(
      StyleSheet.flatten(screen.getByTestId("sk").props.style).backgroundColor
    ).toBe("rgba(255,255,255,0.14)");
  });

  it("applies the custom tint in the reduce-motion (static) branch too", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);

    await render(<Skeleton testID="sk" color="rgba(255,255,255,0.14)" />);

    await waitFor(() =>
      expect(
        StyleSheet.flatten(screen.getByTestId("sk").props.style).backgroundColor
      ).toBe("rgba(255,255,255,0.14)")
    );
  });
});
