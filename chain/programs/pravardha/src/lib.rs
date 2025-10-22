use anchor_lang::prelude::*;

declare_id!("3ymKhbdeWhih43vZ9jp4xyoJnSH7YUosUaN1tVDQZEQR");

#[program]
pub mod pravardha {
    use super::*;

    /// Register a new device on-chain
    pub fn register_device(
        ctx: Context<RegisterDevice>,
        device_pubkey: Pubkey,
        calibration_hash: [u8; 32],
    ) -> Result<()> {
        let device = &mut ctx.accounts.device;
        device.authority = ctx.accounts.authority.key();
        device.device_pubkey = device_pubkey;
        device.calibration_hash = calibration_hash;
        device.is_active = true;
        device.created_at = Clock::get()?.unix_timestamp;
        
        msg!("Device registered: {:?}", device_pubkey);
        Ok(())
    }

    /// Submit a 15-minute aggregate window with Merkle root
    pub fn submit_aggregate(
        ctx: Context<SubmitAggregate>,
        window_start: i64,
        stats: AggregateStats,
        sample_count: u32,
        merkle_root: [u8; 32],
        offchain_uri: String,
    ) -> Result<()> {
        require!(offchain_uri.len() <= 200, ErrorCode::UriTooLong);
        
        let aggregate = &mut ctx.accounts.window_aggregate;
        aggregate.device = ctx.accounts.device.key();
        aggregate.window_start = window_start;
        aggregate.stats = stats;
        aggregate.sample_count = sample_count;
        aggregate.merkle_root = merkle_root;
        aggregate.offchain_uri = offchain_uri;
        aggregate.submitted_at = Clock::get()?.unix_timestamp;
        aggregate.bump = ctx.bumps.window_aggregate;
        
        msg!("Aggregate submitted for window: {}", window_start);
        msg!("Merkle root: {:?}", merkle_root);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(device_pubkey: Pubkey)]
pub struct RegisterDevice<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Device::INIT_SPACE,
        seeds = [b"device", device_pubkey.as_ref()],
        bump
    )]
    pub device: Account<'info, Device>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(window_start: i64)]
pub struct SubmitAggregate<'info> {
    #[account(
        seeds = [b"device", device.device_pubkey.as_ref()],
        bump,
        constraint = device.is_active @ ErrorCode::DeviceInactive
    )]
    pub device: Account<'info, Device>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + WindowAggregate::INIT_SPACE,
        seeds = [b"aggregate", device.key().as_ref(), &window_start.to_le_bytes()],
        bump
    )]
    pub window_aggregate: Account<'info, WindowAggregate>,
    
    #[account(
        mut,
        constraint = authority.key() == device.authority @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Device {
    pub authority: Pubkey,
    pub device_pubkey: Pubkey,
    pub calibration_hash: [u8; 32],
    pub is_active: bool,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct WindowAggregate {
    pub device: Pubkey,
    pub window_start: i64,
    pub stats: AggregateStats,
    pub sample_count: u32,
    pub merkle_root: [u8; 32],
    #[max_len(200)]
    pub offchain_uri: String,
    pub submitted_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct AggregateStats {
    pub temp_min: f32,
    pub temp_max: f32,
    pub temp_avg: f32,
    pub humidity_min: f32,
    pub humidity_max: f32,
    pub humidity_avg: f32,
    pub pressure_min: f32,
    pub pressure_max: f32,
    pub pressure_avg: f32,
}

#[error_code]
pub enum ErrorCode {
    #[msg("URI too long (max 200 characters)")]
    UriTooLong,
    #[msg("Device is not active")]
    DeviceInactive,
    #[msg("Unauthorized: not device authority")]
    Unauthorized,
}
