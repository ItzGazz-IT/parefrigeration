import { createTheme } from '@mui/material/styles';

const baseTheme = createTheme();

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2E56E6' },
    secondary: { main: '#90A8FF' },
    background: {
      default: '#F3F6FF',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1E2A4A',
      secondary: '#5E6B8A',
    },
  },
  typography: {
    ...baseTheme.typography,
    fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
    fontSize: 15,
    h4: {
      fontSize: '1.6rem',
      fontWeight: 700,
      letterSpacing: 0.2,
    },
    h5: {
      fontSize: '1.35rem',
      fontWeight: 700,
    },
    h6: {
      fontSize: '1.05rem',
      fontWeight: 600,
    },
    subtitle2: {
      fontSize: '0.9rem',
      fontWeight: 600,
    },
    body2: {
      fontSize: '0.92rem',
    },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: '#FFFFFF',
          border: '1px solid rgba(46, 86, 230, 0.14)',
          boxShadow: '0 4px 14px rgba(35, 71, 184, 0.08)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#2347B8',
          color: '#F8FAFF',
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#2347B8',
          color: '#F8FAFF',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#E8EEFF',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          color: '#2A3A66',
          fontSize: '0.95rem',
          letterSpacing: 0.2,
          padding: '14px 16px',
          borderBottom: '1px solid rgba(46, 86, 230, 0.20)',
        },
        body: {
          fontSize: '0.95rem',
          padding: '14px 16px',
          borderBottom: '1px solid rgba(46, 86, 230, 0.12)',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:nth-of-type(even)': {
            backgroundColor: 'rgba(46, 86, 230, 0.035)',
          },
        },
      },
    },
  },
});

export default theme;