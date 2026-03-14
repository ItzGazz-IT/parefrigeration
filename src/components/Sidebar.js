import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';

const SOURCE_NAMES = {
  1: 'TFFW Swaziland',
  2: 'TFFW Durban',
  3: 'TFFW Midrand',
  4: 'TFFW Exchange',
  5: 'Inhouse Exchange',
  6: 'Bought Back',
};

const SOURCE_ICON_MAP = {
  1: InventoryIcon,
  2: InventoryIcon,
  3: InventoryIcon,
  4: LocalShippingIcon,
  5: SwapHorizIcon,
  6: SwapHorizIcon,
};

const SCAN_OUT_TYPES = [
  { key: 'ACTUAL_SALE', label: 'Actual Sale', Icon: InventoryIcon },
  { key: 'TFFW_EXCHANGE', label: 'TFFW Exchange', Icon: SwapHorizIcon },
  { key: 'INHOUSE_EXCHANGE', label: 'Inhouse Exchange', Icon: SwapHorizIcon },
  { key: 'TAKEALOT', label: 'Takealot', Icon: LocalShippingIcon },
  { key: 'TFF_DEALER', label: 'TFF Dealer', Icon: InventoryIcon },
];

const Sidebar = ({ drawerWidth = 240, activePage = 'dashboard', onNavigate, currentTitle = 'Dashboard', warehouses = [] }) => {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);

  const warehouseById = useMemo(() => {
    const next = new Map();
    warehouses.forEach((warehouse) => {
      next.set(warehouse.id, warehouse);
    });
    return next;
  }, [warehouses]);

  const selectedWarehouse = selectedWarehouseId ? warehouseById.get(selectedWarehouseId) : null;
  const selectedWarehouseName = selectedWarehouse
    ? (selectedWarehouse.name || selectedWarehouse.warehouse_name || selectedWarehouse.warehouse || selectedWarehouse.title || `Warehouse ${selectedWarehouseId}`)
    : '';

  const handleWarehouseClick = (event, warehouseId) => {
    setSelectedWarehouseId(warehouseId);
    setAnchorEl(event.currentTarget);
  };

  const closePopover = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  return (
    <Drawer
      variant="permanent"
      anchor="left"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          border: '1px solid rgba(46, 86, 230, 0.22)',
          bgcolor: '#F8FAFF',
          color: '#1E2A4A',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'visible',
          position: 'fixed',
          top: '50%',
          left: 14,
          transform: 'translateY(-50%)',
          height: 'auto',
          maxHeight: 'calc(100vh - 120px)',
          borderRadius: 2.5,
          boxShadow: '0 14px 34px rgba(35, 71, 184, 0.18)',
        },
      }}
    >
      <Box sx={{ px: 0.55, py: 0.72, display: 'flex', justifyContent: 'center' }}>
        <Stack spacing={0.72} alignItems="center">
          {warehouses.map((warehouse) => {
            const warehouseId = warehouse.id;
            const warehouseName = warehouse.name || warehouse.warehouse_name || warehouse.warehouse || warehouse.title || `Warehouse ${warehouseId}`;
            const isWarehouseActive = String(activePage).startsWith(`wh-${warehouseId}-src-`);
            const initials = String(warehouseName)
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
              .toUpperCase();

            return (
              <Tooltip title={warehouseName} placement="right" key={warehouseId}>
                <Avatar
                  onClick={(event) => handleWarehouseClick(event, warehouseId)}
                  sx={{
                    width: 36,
                    height: 36,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    bgcolor: isWarehouseActive ? 'primary.main' : '#E9F0FF',
                    color: isWarehouseActive ? '#FFFFFF' : 'primary.main',
                    border: isWarehouseActive ? '2px solid rgba(46, 86, 230, 0.32)' : '1px solid rgba(46, 86, 230, 0.22)',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      transform: 'translateY(-1px)',
                      boxShadow: '0 6px 12px rgba(35, 71, 184, 0.18)',
                    },
                  }}
                >
                  {initials || <WarehouseIcon sx={{ fontSize: 15 }} />}
                </Avatar>
              </Tooltip>
            );
          })}
        </Stack>
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={closePopover}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        PaperProps={{
          sx: {
            ml: 1,
            p: 0,
            minWidth: 190,
            maxWidth: 240,
            borderRadius: 1.7,
            overflow: 'hidden',
            border: '1px solid rgba(46, 86, 230, 0.20)',
            boxShadow: '0 12px 28px rgba(35, 71, 184, 0.20)',
          },
        }}
      >
        <Box sx={{ px: 0.9, py: 0.65, bgcolor: 'primary.main', borderBottom: '1px solid rgba(35, 71, 184, 0.32)' }}>
          <Typography sx={{ fontSize: '0.77rem', fontWeight: 700, color: '#FFFFFF' }}>
            {selectedWarehouseName || currentTitle}
          </Typography>
        </Box>

        <List disablePadding sx={{ p: 0.45 }}>
          <Box sx={{ px: 0.9, pt: 0.35, pb: 0.28 }}>
            <Typography
              sx={{
                fontSize: '0.66rem',
                fontWeight: 800,
                color: 'primary.main',
                textTransform: 'uppercase',
                letterSpacing: 0.65,
                lineHeight: 1.2,
              }}
            >
              Scan In
            </Typography>
          </Box>
          {[1, 2, 3, 4, 5, 6].map((sourceId) => {
            const Icon = SOURCE_ICON_MAP[sourceId];
            const pageKey = selectedWarehouseId ? `wh-${selectedWarehouseId}-src-${sourceId}` : `src-${sourceId}`;
            return (
              <ListItem disablePadding key={sourceId}>
                <ListItemButton
                  selected={activePage === pageKey}
                  onClick={() => {
                    if (selectedWarehouseId) {
                      onNavigate?.(pageKey);
                      closePopover();
                    }
                  }}
                  sx={{
                    minHeight: 31,
                    borderRadius: 1.1,
                    px: 0.9,
                    py: 0.15,
                    color: 'text.secondary',
                    '&.Mui-selected': { bgcolor: 'rgba(46, 86, 230, 0.14)', color: 'primary.main' },
                    '&:hover': { bgcolor: 'rgba(46, 86, 230, 0.08)' },
                  }}
                >
                  <Box sx={{ width: 18, mr: 0.9, display: 'flex', justifyContent: 'center', color: 'inherit' }}>
                    <Icon sx={{ fontSize: 14 }} />
                  </Box>
                  <ListItemText primary={SOURCE_NAMES[sourceId]} primaryTypographyProps={{ fontSize: '0.74rem', fontWeight: 600 }} />
                </ListItemButton>
              </ListItem>
            );
          })}

          <Box sx={{ px: 0.9, pt: 0.75, pb: 0.28 }}>
            <Typography
              sx={{
                fontSize: '0.66rem',
                fontWeight: 800,
                color: 'primary.main',
                textTransform: 'uppercase',
                letterSpacing: 0.65,
                lineHeight: 1.2,
              }}
            >
              Scan Out
            </Typography>
          </Box>

          {SCAN_OUT_TYPES.map(({ key, label, Icon }) => {
            const pageKey = selectedWarehouseId ? `wh-${selectedWarehouseId}-scanout-${key}` : `scanout-${key}`;

            return (
              <ListItem disablePadding key={key}>
                <ListItemButton
                  selected={activePage === pageKey}
                  onClick={() => {
                    if (selectedWarehouseId) {
                      onNavigate?.(pageKey);
                      closePopover();
                    }
                  }}
                  sx={{
                    minHeight: 31,
                    borderRadius: 1.1,
                    px: 0.9,
                    py: 0.15,
                    color: 'text.secondary',
                    '&.Mui-selected': { bgcolor: 'rgba(46, 86, 230, 0.14)', color: 'primary.main' },
                    '&:hover': { bgcolor: 'rgba(46, 86, 230, 0.08)' },
                  }}
                >
                  <Box sx={{ width: 18, mr: 0.9, display: 'flex', justifyContent: 'center', color: 'inherit' }}>
                    <Icon sx={{ fontSize: 14 }} />
                  </Box>
                  <ListItemText primary={label} primaryTypographyProps={{ fontSize: '0.74rem', fontWeight: 600 }} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Popover>
    </Drawer>
  );
};

export default Sidebar;