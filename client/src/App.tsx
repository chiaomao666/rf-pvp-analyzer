import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import BridgeSync from "@/components/BridgeSync";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Account from "@/pages/Account";
import Home from "@/pages/Home";
import MatchDetail from "@/pages/MatchDetail";
import Matches from "@/pages/Matches";
import NotFound from "@/pages/NotFound";
import Record from "@/pages/Record";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

function Shell({ children }: { children: React.ReactNode }) { return <DashboardLayout>{children}</DashboardLayout>; }
function AppRoutes() {
  return <Switch>
    <Route path="/matches"><Shell><Matches /></Shell></Route>
    <Route path="/matches/:id">{params => <Shell><MatchDetail id={Number(params.id)} /></Shell>}</Route>
    <Route path="/record"><Shell><Record /></Shell></Route>
    <Route path="/account"><Shell><Account /></Shell></Route>
    <Route path="/"><Shell><Home /></Shell></Route>
    <Route path="/404"><NotFound /></Route>
    <Route><NotFound /></Route>
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster /><Router hook={useHashLocation}><BridgeSync /><AppRoutes /></Router></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
