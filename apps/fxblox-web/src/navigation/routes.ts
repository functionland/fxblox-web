/**
 * Mobile route names — the `Routes` enum copied verbatim from
 * `E:\GitHub\fx\apps\box\src\navigation\navigationConfig.ts` (enum only; the react-navigation param-list types
 * are not ported). `app/paths.ts` maps every value to a URL (`ROUTE_NAME_TO_PATH`) so screen logic that still
 * speaks in route names (`navigate(Routes.Pools)`) ports mechanically.
 */
export enum Routes {
  // Root
  InitialSetup = 'InitialSetup',
  MainTabs = 'MainTabs',
  Hub = 'Hub',
  Plugin = 'Plugin',

  // Initial Setup
  Welcome = 'Welcome',
  LinkPassword = 'Link Password',
  ConnectToWallet = 'Connect To Wallet',
  ConnectToBlox = 'Connect To Blox',
  ConnectToExistingBlox = 'Connect To Existing Blox',
  ConnectToWifi = 'Connect To Wifi',
  CheckConnection = 'Check Connection',
  SetupComplete = 'Setup Complete',
  SetBloxAuthorizer = 'Set Blox Authorizer',

  // Main Tab
  BloxTab = 'BloxTab',
  UsersTab = 'UsersTab',
  HubTab = 'HubTab',
  PluginTab = 'PluginTab',
  DevicesTab = 'DevicesTab',
  SettingsTab = 'SettingsTab',
  DiagnosticsTab = 'DiagnosticsTab',

  // Blox Manager
  BloxManager = 'BloxManager',

  // Settings Stack
  Settings = 'Settings',
  ConnectedDApps = 'ConnectedDApps',
  BloxStatusMonitor = 'BloxStatusMonitor',
  Mode = 'Mode',
  ChainSelection = 'ChainSelection',
  Pools = 'Pools',
  PoolDetails = 'PoolDetails',
  JoinRequests = 'JoinRequests',
  About = 'About',
  ComponentGallery = 'Component Gallery',
  BloxLogs = 'BloxLogs',
  BluetoothCommands = 'BluetoothCommands',
  AutoPinPairing = 'AutoPinPairing',

  // Component Gallery
  Avatars = 'Avatars',
  Buttons = 'Buttons',
  ButtonGroups = 'Button Groups',
  Forms = 'Forms',
  Gallery = 'Gallery',
  UsageBar = 'Usage Bar',
  ProgressBar = 'Progress Bar',
  Tabs = 'Tabs',
  Toast = 'Toast',
  Table = 'Table',
  Breadcrumbs = 'Breadcrumbs',
  Files = 'Files',
}
