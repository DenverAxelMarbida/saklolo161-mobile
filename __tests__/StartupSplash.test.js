import React from "react";
import { render, screen } from "@testing-library/react-native";
import StartupSplash from "../src/components/StartupSplash";
import { THEMES } from "../lib/themes";

describe("StartupSplash", () => {
  it("shows the shared logo asset with the brand name underneath", async () => {
    await render(<StartupSplash />);

    const logo = screen.getByLabelText("Saklolo 161 logo");
    expect(logo.props.source).toEqual(require("../assets/icon.png"));
    expect(screen.getByText("Saklolo 161")).toBeTruthy();
  });

  it("keeps the dark navy splash branding", async () => {
    await render(<StartupSplash />);

    expect(screen.getByTestId("startup-splash")).toHaveStyle({
      backgroundColor: THEMES.darkNavy,
    });
  });
});
