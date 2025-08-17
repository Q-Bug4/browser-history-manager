/// 初始化tracing订阅器，包含请求ID和格式化输出
pub fn init_tracing() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,actix_web=info".into());
    
    tracing_subscriber::fmt()
        .compact()  // 紧凑格式更易读
        .with_env_filter(env_filter)
        .with_thread_ids(false)
        .with_thread_names(false)
        .init();

    Ok(())
}