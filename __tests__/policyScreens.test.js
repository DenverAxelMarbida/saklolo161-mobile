import React from "react";
import { StyleSheet } from "react-native";
import {
  render,
  screen,
  fireEvent,
  act,
} from "@testing-library/react-native";
import App from "../App";
import AboutScreen from "../src/screens/AboutScreen";
import PrivacyPolicy from "../src/screens/PrivacyPolicy";
import TermsOfUse from "../src/screens/TermsOfUse";

jest.mock("lucide-react-native", () => {
  const ReactMock = require("react");
  const { Text } = require("react-native");
  return new Proxy(
    {},
    {
      get: (_, prop) => (props) =>
        ReactMock.createElement(
          Text,
          { testID: `icon-${String(prop)}` },
          String(prop)
        ),
    }
  );
});

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock("expo-video", () => ({
  useVideoPlayer: jest.fn(() => ({})),
  VideoView: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const mock = require("react-native-safe-area-context/jest/mock");
  return mock.default || mock;
});

jest.mock("axios", () => ({
  get: jest.fn(() => Promise.reject(new Error("network down"))),
  post: jest.fn(() => Promise.reject(new Error("network down"))),
}));

jest.mock("../lib/storage", () => ({
  getSavedPhone: jest.fn(() => Promise.resolve(null)),
  savePhone: jest.fn(() => Promise.resolve()),
  saveIncidentId: jest.fn(() => Promise.resolve()),
  getRecentIncidentIds: jest.fn(() => Promise.resolve([])),
  removeIncidentId: jest.fn(() => Promise.resolve()),
  getResolvedIncidents: jest.fn(() => Promise.resolve([])),
  saveResolvedIncident: jest.fn(() => Promise.resolve()),
  getFailedEvidence: jest.fn(() => Promise.resolve([])),
  saveFailedEvidence: jest.fn(() => Promise.resolve()),
  clearFailedEvidence: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PrivacyPolicy screen", () => {
  it("renders the title, section headings, and draft notice", async () => {
    await render(<PrivacyPolicy onBack={jest.fn()} />);

    expect(screen.getByText("Privacy Policy")).toBeTruthy();
    expect(screen.getByTestId("privacy-scroll")).toBeTruthy();
    expect(screen.getByTestId("privacy-draft-notice")).toBeTruthy();
    expect(screen.getByTestId("privacy-collect")).toBeTruthy();
    expect(screen.getByTestId("privacy-purpose")).toBeTruthy();
    expect(screen.getByTestId("privacy-storage")).toBeTruthy();
    expect(screen.getByTestId("privacy-access")).toBeTruthy();
    expect(screen.getByTestId("privacy-retention")).toBeTruthy();
    expect(screen.getByTestId("privacy-rights")).toBeTruthy();
  });

  it("marks retention and rights contact as pending agency review", async () => {
    await render(<PrivacyPolicy onBack={jest.fn()} />);

    expect(screen.getAllByText(/pending agency review/i).length).toBeGreaterThanOrEqual(2);
  });

  it("back button returns via onBack", async () => {
    const onBack = jest.fn();
    await render(<PrivacyPolicy onBack={onBack} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("privacy-back"));
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("TermsOfUse screen", () => {
  it("renders the title, section headings, and draft notice", async () => {
    await render(<TermsOfUse onBack={jest.fn()} />);

    expect(screen.getByText("Terms of Use")).toBeTruthy();
    expect(screen.getByTestId("terms-scroll")).toBeTruthy();
    expect(screen.getByTestId("terms-draft-notice")).toBeTruthy();
    expect(screen.getByTestId("terms-genuine")).toBeTruthy();
    expect(screen.getByTestId("terms-accurate")).toBeTruthy();
    expect(screen.getByTestId("terms-abuse")).toBeTruthy();
    expect(screen.getByTestId("terms-response")).toBeTruthy();
    expect(screen.getByTestId("terms-immediate")).toBeTruthy();
  });

  it("states arrival times as estimates without exact-time promises", async () => {
    await render(<TermsOfUse onBack={jest.fn()} />);

    expect(screen.getByText(/not a promise of an exact arrival time/i)).toBeTruthy();
  });

  it("back button returns via onBack", async () => {
    const onBack = jest.fn();
    await render(<TermsOfUse onBack={onBack} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId("terms-back"));
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("Policy back buttons match the app-wide circle style", () => {
  const CIRCLE_BACK_BTN = {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  };

  it("Privacy Policy back button uses the circle style", async () => {
    await render(<PrivacyPolicy onBack={jest.fn()} />);

    // toMatchObject: the host TouchableOpacity injects its own opacity
    // key in the test renderer — only the circle contract matters here.
    expect(
      StyleSheet.flatten(screen.getByTestId("privacy-back").props.style)
    ).toMatchObject(CIRCLE_BACK_BTN);
  });

  it("Terms of Use back button uses the circle style", async () => {
    await render(<TermsOfUse onBack={jest.fn()} />);

    expect(
      StyleSheet.flatten(screen.getByTestId("terms-back").props.style)
    ).toMatchObject(CIRCLE_BACK_BTN);
  });
});

describe("About screen policy links", () => {
  it("shows Privacy Policy and Terms of Use links", async () => {
    await render(
      <AboutScreen onOpenPrivacy={jest.fn()} onOpenTerms={jest.fn()} />
    );

    expect(screen.getByTestId("link-privacy-policy")).toBeTruthy();
    expect(screen.getByTestId("link-terms-of-use")).toBeTruthy();
  });

  it("pressing the links calls the navigation callbacks", async () => {
    const onOpenPrivacy = jest.fn();
    const onOpenTerms = jest.fn();
    await render(
      <AboutScreen onOpenPrivacy={onOpenPrivacy} onOpenTerms={onOpenTerms} />
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("link-privacy-policy"));
    });
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(screen.getByTestId("link-terms-of-use"));
    });
    expect(onOpenTerms).toHaveBeenCalledTimes(1);
  });
});

describe("App policy navigation", () => {
  it("opens the Privacy Policy from About and returns via back", async () => {
    await render(<App />);
    await screen.findByText("REPORT AN EMERGENCY", {}, { timeout: 5000 });

    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-about"));
    });
    await screen.findByTestId("about-scroll", {}, { timeout: 5000 });

    await act(async () => {
      fireEvent.press(screen.getByTestId("link-privacy-policy"));
    });
    expect(await screen.findByTestId("privacy-scroll")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("privacy-back"));
    });
    expect(await screen.findByTestId("about-scroll")).toBeTruthy();
  }, 15000);

  it("opens the Terms of Use from About and returns via back", async () => {
    await render(<App />);
    await screen.findByText("REPORT AN EMERGENCY", {}, { timeout: 5000 });

    await act(async () => {
      fireEvent.press(screen.getByTestId("tab-about"));
    });
    await screen.findByTestId("about-scroll", {}, { timeout: 5000 });

    await act(async () => {
      fireEvent.press(screen.getByTestId("link-terms-of-use"));
    });
    expect(await screen.findByTestId("terms-scroll")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("terms-back"));
    });
    expect(await screen.findByTestId("about-scroll")).toBeTruthy();
  }, 15000);
});
